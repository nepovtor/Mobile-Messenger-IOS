import { randomBytes, randomUUID } from "node:crypto";

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

async function readForm(request) {
  if (
    request.headers["content-type"]?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw Object.assign(new Error(), { status: 415 });
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) throw Object.assign(new Error(), { status: 413 });
    chunks.push(chunk);
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw Object.assign(new Error(), { status: 400 });
  return params;
}

export function interactionMiddleware(provider, config, Adapter, backend) {
  const forms = new Adapter("BridgeForm");
  const nonces = new Adapter("BridgeNonce");
  async function render(ctx, details, state, message = "") {
    const nonce = randomBytes(32).toString("base64url");
    await nonces.upsert(nonce, { interaction: details.uid }, 300);
    const prefix = `/interaction/${encodeURIComponent(details.uid)}`;
    const consent = details.prompt.name === "consent";
    const action = consent ? "confirm" : state.phone ? "verify" : "request";
    const input = consent
      ? ""
      : state.phone
        ? '<label>Код подтверждения <input name="code" inputmode="numeric" autocomplete="one-time-code" minlength="4" maxlength="12" required></label>'
        : '<label>Номер телефона <input name="phone" type="tel" autocomplete="tel" minlength="8" maxlength="32" required></label>';
    ctx.type = "html";
    ctx.body = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Вход в мессенджер</title><main><h1>${consent ? "Продолжить вход в мессенджер" : "Вход по коду"}</h1><p>${escapeHTML(message)}</p><form method="post" action="${prefix}/${action}"><input type="hidden" name="csrf" value="${nonce}">${input}<button type="submit">${consent ? "Продолжить" : state.phone ? "Подтвердить" : "Получить код"}</button></form></main></html>`;
  }
  return async (ctx, next) => {
    const match =
      /^\/interaction\/([A-Za-z0-9_-]+)(?:\/(request|verify|confirm))?$/.exec(
        ctx.path,
      );
    if (!match) return next();
    const details = await provider.interactionDetails(ctx.req, ctx.res);
    if (
      details.uid !== match[1] ||
      details.params.client_id !== config.clientID ||
      !["login", "consent"].includes(details.prompt.name)
    )
      ctx.throw(400);
    let state = await forms.find(details.uid);
    if (!state) {
      if (ctx.method !== "GET") ctx.throw(400);
      state = { deviceUuid: randomUUID() };
      await forms.upsert(details.uid, state, 300);
    }
    if (ctx.method === "GET" && !match[2]) return render(ctx, details, state);
    if (ctx.method !== "POST" || !match[2]) ctx.throw(405);
    if (ctx.get("origin") !== config.issuer) ctx.throw(403);
    const form = await readForm(ctx.req);
    const csrf = form.get("csrf");
    if (!csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) ctx.throw(403);
    const nonce = await nonces.find(csrf);
    if (!nonce || nonce.interaction !== details.uid || nonce.consumed)
      ctx.throw(403);
    await nonces.consume(csrf);
    const action = match[2];
    if (
      action === "confirm" &&
      details.prompt.name === "consent" &&
      details.session?.accountId
    ) {
      const grant = details.grantId
        ? await provider.Grant.find(details.grantId)
        : new provider.Grant({
            accountId: details.session.accountId,
            clientId: config.clientID,
          });
      if (!grant) ctx.throw(400);
      const missing = details.prompt.details.missingOIDCScope ?? [];
      if (missing.some((scope) => !["openid", "profile"].includes(scope)))
        ctx.throw(400);
      grant.addOIDCScope(missing.join(" "));
      const claims = details.prompt.details.missingOIDCClaims ?? [];
      if (
        claims.some((claim) => !["sub", "preferred_username"].includes(claim))
      )
        ctx.throw(400);
      grant.addOIDCClaims(claims);
      const grantId = await grant.save();
      await forms.destroy(details.uid);
      await provider.interactionFinished(
        ctx.req,
        ctx.res,
        { consent: { grantId } },
        { mergeWithLastSubmission: true },
      );
      ctx.respond = false;
      return;
    }
    if (details.prompt.name !== "login") ctx.throw(400);
    try {
      if (action === "request" && !state.phone) {
        const phone = form.get("phone");
        if (!phone || !/^\+?[\d ()-]{8,32}$/.test(phone)) ctx.throw(400);
        await backend("request", {
          phone,
          deviceUuid: state.deviceUuid,
          ipAddress: ctx.ip,
        });
        state = { ...state, phone };
        await forms.upsert(details.uid, state, 300);
        return render(ctx, details, state, "Введите полученный код.");
      }
      if (action === "verify" && state.phone) {
        const code = form.get("code");
        if (!code || !/^\d{4,12}$/.test(code)) ctx.throw(400);
        const account = await backend("verify", {
          phone: state.phone,
          code,
          deviceUuid: state.deviceUuid,
          ipAddress: ctx.ip,
        });
        if (
          !validSubject(account.subject) ||
          !Number.isInteger(account.authTime) ||
          Math.abs(Date.now() / 1000 - account.authTime) > 60
        )
          ctx.throw(502);
        await forms.destroy(details.uid);
        await provider.interactionFinished(
          ctx.req,
          ctx.res,
          {
            login: {
              accountId: account.subject,
              ts: account.authTime,
              amr: ["otp"],
              remember: false,
            },
          },
          { mergeWithLastSubmission: false },
        );
        ctx.respond = false;
        return;
      }
      ctx.throw(400);
    } catch (error) {
      // Do not reflect backend errors, numbers, OTPs, or tokens into HTML/logs.
      ctx.status = error.status === 429 ? 429 : 400;
      return render(
        ctx,
        details,
        state,
        "Не удалось подтвердить вход. Проверьте код или попробуйте позже.",
      );
    }
  };
}

export function validSubject(subject) {
  return (
    typeof subject === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      subject,
    )
  );
}
