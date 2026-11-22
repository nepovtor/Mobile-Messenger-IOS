import { useEffect, useRef, useState } from "react";

export function MatrixCallbackPage() {
  const [delivered, setDelivered] = useState(false);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", "/matrix/callback");
    if (!window.opener) return;
    window.opener.postMessage(
      {
        type: "matrix.oauth.callback",
        state: parameters.get("state"),
        code: parameters.get("code"),
      },
      window.location.origin,
    );
    setDelivered(true);
    window.close();
  }, []);
  return (
    <main className="p-8 text-slate-200">
      <h1 className="text-xl">
        {delivered
          ? "Можно закрыть окно входа"
          : "Вернитесь в окно переписки и повторите вход"}
      </h1>
    </main>
  );
}
