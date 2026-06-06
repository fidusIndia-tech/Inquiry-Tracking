self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/admin-dashboard") || client.url.includes("/employee-dashboard")) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});
