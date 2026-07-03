const DashboardWeather = (() => {
  const cacheKey = "dashboardWeatherGma";
  const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=14.3054&longitude=120.9904&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FManila";

  function getPresentation(code) {
    if (code === 0) return { label: "Clear sky", condition: "clear" };
    if ([1, 2].includes(code)) return { label: "Partly cloudy", condition: "cloudy" };
    if (code === 3) return { label: "Overcast", condition: "cloudy" };
    if ([45, 48].includes(code)) return { label: "Foggy", condition: "fog" };
    if ([51, 53, 55, 56, 57].includes(code)) return { label: "Drizzle", condition: "rain" };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Rain showers", condition: "rain" };
    if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", condition: "storm" };
    return { label: "Variable weather", condition: "cloudy" };
  }

  function renderShell(container) {
    const now = new Date();
    container.className = "discipline-weather dashboard-weather is-loading";
    container.setAttribute("aria-live", "polite");
    container.dataset.internetFeature = "Live weather uses Open-Meteo and needs internet. Cached or blank weather may show while offline.";
    container.innerHTML = `
      <div class="weather-scene" aria-hidden="true">
        <span class="weather-sun"></span>
        <span class="weather-moon"></span>
        <span class="weather-cloud weather-cloud-one"></span>
        <span class="weather-cloud weather-cloud-two"></span>
        <span class="weather-rain"></span>
        <span class="weather-lightning"></span>
        <span class="weather-fog"></span>
      </div>
      <div class="weather-reading">
        <span class="weather-location">General Mariano Alvarez</span>
        <span class="weather-date">
          <strong>${now.toLocaleDateString(undefined, { weekday: "long" })}</strong>
          <span>${now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
        </span>
        <strong data-weather-temperature>--&deg;C</strong>
        <span data-weather-condition>Loading local weather...</span>
      </div>
      <div class="weather-details">
        <span><small>Feels</small><strong data-weather-feels>--&deg;</strong></span>
        <span><small>Humidity</small><strong data-weather-humidity>--%</strong></span>
        <span><small>Wind</small><strong data-weather-wind>-- km/h</strong></span>
      </div>
    `;
  }

  function renderWeather(container, current) {
    if (!container || !current) return;
    const presentation = getPresentation(Number(current.weather_code));
    container.className = `discipline-weather dashboard-weather is-${presentation.condition} ${Number(current.is_day) === 0 ? "is-night" : "is-day"}`;
    container.querySelector("[data-weather-temperature]").innerHTML = `${Math.round(Number(current.temperature_2m))}&deg;C`;
    container.querySelector("[data-weather-condition]").textContent = presentation.label;
    container.querySelector("[data-weather-feels]").innerHTML = `${Math.round(Number(current.apparent_temperature))}&deg;`;
    container.querySelector("[data-weather-humidity]").textContent = `${Math.round(Number(current.relative_humidity_2m))}%`;
    container.querySelector("[data-weather-wind]").textContent = `${Math.round(Number(current.wind_speed_10m))} km/h`;
  }

  async function loadWeather(container) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - Number(parsed.savedAt || 0) < 15 * 60 * 1000) {
          renderWeather(container, parsed.current);
          return;
        }
      } catch (error) {
        localStorage.removeItem(cacheKey);
      }
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      if (navigator.onLine === false) {
        throw new Error("Internet unavailable");
      }
      const response = await fetch(weatherUrl, { signal: controller.signal });
      if (!response.ok) throw new Error("Weather request failed");
      const data = await response.json();
      renderWeather(container, data.current);
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), current: data.current }));
    } catch (error) {
      container.className = "discipline-weather dashboard-weather is-cloudy is-unavailable";
      container.querySelector("[data-weather-condition]").textContent = navigator.onLine === false ? "Internet unavailable" : "Weather unavailable";
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function mount(container) {
    if (!container || container.dataset.weatherMounted === "true") return;
    container.dataset.weatherMounted = "true";
    renderShell(container);
    window.syncInternetDependentNotices?.();
    loadWeather(container);
  }

  function mountAll() {
    document.querySelectorAll("[data-dashboard-weather]").forEach(mount);
  }

  return { mount, mountAll };
})();

window.DashboardWeather = DashboardWeather;
