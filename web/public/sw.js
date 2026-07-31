/* global self, URL */

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      const decodedPayload = event.data.json();
      if (typeof decodedPayload === "object" && decodedPayload !== null) {
        payload = decodedPayload;
      }
    } catch {
      payload = {};
    }
  }

  const options = {
    tag: payload.messageId || payload.chatId || "message-created",
    data: {
      url: payload.url || "/messenger",
      chatId: payload.chatId || null,
      messageId: payload.messageId || null,
      type: payload.type || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification("Новое сообщение", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedUrl = new URL(
    event.notification.data?.url || "/messenger",
    self.location.origin,
  );
  const destinationUrl =
    requestedUrl.origin === self.location.origin
      ? requestedUrl
      : new URL("/messenger", self.location.origin);
  const destinationPath =
    destinationUrl.pathname + destinationUrl.search + destinationUrl.hash;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const visibleClient = clients.find((client) => "focus" in client);

        if (visibleClient) {
          return visibleClient.focus().then(() => {
            visibleClient.postMessage({
              type: "push.navigate",
              url: destinationPath,
              chatId: event.notification.data?.chatId || null,
            });
          });
        }

        return self.clients.openWindow(destinationPath);
      }),
  );
});
