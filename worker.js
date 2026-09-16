const STOREFRONT_PAGES = new Set([
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "account",
  "shop",
  "product",
  "cart",
  "checkout",
  "orders",
  "order",
  "payment-callback",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/storefront/" || url.pathname === "/storefront/index.html") {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = "/storefront/index.html";
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (url.pathname.startsWith("/storefront/") && url.pathname.endsWith(".html")) {
      const filename = url.pathname.slice("/storefront/".length);
      const canonical = new URL(request.url);
      canonical.pathname = `/${filename}`;
      return Response.redirect(canonical, 301);
    }

    if (url.pathname === "/") {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = "/storefront/index.html";
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (url.pathname === "/admin") {
      const canonical = new URL(request.url);
      canonical.pathname = "/admin/";
      return Response.redirect(canonical, 301);
    }

    if (url.pathname === "/admin/") {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = "/admin/index.html";
      return env.ASSETS.fetch(new Request(adminUrl, request));
    }

    const cleanPath = url.pathname.replace(/^\//, "");
    if (STOREFRONT_PAGES.has(cleanPath)) {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = `/storefront/${cleanPath}.html`;
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (
      url.pathname.endsWith(".html") &&
      !url.pathname.startsWith("/storefront/") &&
      !url.pathname.startsWith("/admin/")
    ) {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = `/storefront${url.pathname}`;
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
