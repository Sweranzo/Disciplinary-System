function getPublicOrigin() {
  const configuredOrigin = process.env.PUBLIC_API_ORIGIN
    || process.env.API_ORIGIN
    || process.env.RENDER_EXTERNAL_URL;

  if (configuredOrigin) {
    return String(configuredOrigin).replace(/\/+$/, "");
  }

  return `http://localhost:${process.env.PORT || 5000}`;
}

function buildPublicUrl(pathname) {
  if (!pathname) {
    return "";
  }

  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  const normalizedPath = String(pathname).startsWith("/") ? pathname : `/${pathname}`;
  return `${getPublicOrigin()}${normalizedPath}`;
}

module.exports = { buildPublicUrl, getPublicOrigin };
