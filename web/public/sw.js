/* global self, URL */

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Mobile Messenger",
      body: event.data.text(),
      url: "/messenger",
    };
  }

  const title = payload.title || "Mobile Messenger";
  const options = {
    body: payload.body || "У вас новое сообщение.",
    tag: payload.messageId || payload.chatId || "message-created",
    data: {
      url: payload.url || "/messenger",
      chatId: payload.chatId || null,
      messageId: payload.messageId || null,
      type: payload.type || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destinationUrl = new URL(
    event.notification.data?.url || "/messenger",
    self.location.origin,
  );
  const destinationPath =
    destinationUrl.pathname + destinationUrl.search + destinationUrl.hash;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
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
