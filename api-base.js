let API_BASE = "/api";
const resolveApiBase = () => {
  const override = localStorage.getItem("API_BASE_OVERRIDE");
  if (override && typeof override === "string") {
    return override.replace(/\/+$/, "");
  }
  return API_BASE;
};
