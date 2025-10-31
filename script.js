const OPENWEATHER_API_KEY = "418cf366faa52b1dd1bd71328f11e271";
const WEATHER_API_BASE = "https://api.openweathermap.org/data/2.5/weather";
const DEFAULT_CITY = "Windhoek,NA";

let state = {
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0-indexed
  holidaysRaw: [],
  holidaysComputed: [], // {dateISO, name, description, emoji}
  events: loadEvents(),
};

document.addEventListener("DOMContentLoaded", init);

// ---------- init ----------
async function init() {
  bindUI();
  await loadHolidays();
  renderCalendar();
  renderUpcoming();
  startClock();
  startCountdown();
  // initial weather load (Windhoek)
  fetchWeatherByCity(DEFAULT_CITY);
}

// ---------- UI Bindings ----------
function bindUI() {
  document.getElementById("prevMonth").addEventListener("click", () => { changeMonth(-1); });
  document.getElementById("nextMonth").addEventListener("click", () => { changeMonth(1); });
  document.getElementById("prevYear").addEventListener("click", () => { changeYear(-1); });
  document.getElementById("nextYear").addEventListener("click", () => { changeYear(1); });
  document.getElementById("todayBtn").addEventListener("click", goToToday);
  document.getElementById("addEventBtn").addEventListener("click", () => openAddEventModalForDate(new Date()));
  document.getElementById("searchBtn").addEventListener("click", onSearch);
  document.getElementById("searchInput").addEventListener("keypress", (e)=>{ if(e.key==='Enter') onSearch() });
  document.getElementById("geoBtn").addEventListener("click", geoLocate);
  document.getElementById("refreshBtn").addEventListener("click", refreshEverything);
  document.getElementById("modeToggle").addEventListener("click", toggleMode);

  // modal actions
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalSave").addEventListener("click", modalSave);
}

// ---------- Holidays ----------
async function loadHolidays(){
  try {
    const r = await fetch("./holidays.json");
    const j = await r.json();
    state.holidaysRaw = j.holidays || [];
    computeHolidaysForYear(state.viewYear);
  } catch (err){
    console.error("Failed to load holidays.json", err);
  }
}

function computeHolidaysForYear(year){
  const out = [];
  for (const h of state.holidaysRaw){
    if (h.type === "fixed"){
      const dt = new Date(Date.UTC(year, h.month -1, h.day));
      out.push({
        id: h.id,
        name: h.name,
        description: h.description || "",
        emoji: h.emoji || "🎉",
        dateISO: dt.toISOString().slice(0,10)
      });
    } else if (h.type === "easter_offset"){
      const easter = computeEasterSunday(year);
      const dt = new Date(easter);
      dt.setDate(dt.getDate() + (h.offset || 0));
      out.push({
        id: h.id,
        name: h.name,
        description: h.description || "",
        emoji: h.emoji || "🎉",
        dateISO: dt.toISOString().slice(0,10)
      });
    }
  }
  state.holidaysComputed = out;
}

// compute Easter Sunday
function computeEasterSunday(y){
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31); // 3=March,4=April
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

// ---------- Calendar Rendering ----------
function renderCalendar(){
  computeHolidaysForYear(state.viewYear);
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";

  // Weekday headers
  const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let wd of weekdays){
    const el = document.createElement("div");
    el.className = "weekday";
    el.textContent = wd;
    cal.appendChild(el);
  }

  const firstOfMonth = new Date(state.viewYear, state.viewMonth, 1);
  const startDay = firstOfMonth.getDay(); // 0-6
  const daysInMonth = new Date(state.viewYear, state.viewMonth+1, 0).getDate();

  // previous month's trailing days
  const prevMonthDays = new Date(state.viewYear, state.viewMonth, 0).getDate();
  const totalCells = Math.ceil((startDay + daysInMonth)/7)*7;
  let dayCounter = 1;
  for (let i=0;i<totalCells;i++){
    const cell = document.createElement("div");
    cell.className = "day";
    if (i < startDay){
      // previous month
      const d = prevMonthDays - (startDay - 1 - i);
      cell.classList.add("other-month");
      cell.dataset.date = formatISO(new Date(state.viewYear, state.viewMonth -1, d));
      cell.innerHTML = `<div class="date">${d}</div>`;
    } else if (i >= startDay + daysInMonth){
      // next month
      const d = dayCounter++;
      cell.classList.add("other-month");
      cell.dataset.date = formatISO(new Date(state.viewYear, state.viewMonth +1, d));
      cell.innerHTML = `<div class="date">${d}</div>`;
    } else {
      const d = i - startDay + 1;
      const dateObj = new Date(state.viewYear, state.viewMonth, d);
      const iso = formatISO(dateObj);
      cell.dataset.date = iso;
      cell.innerHTML = `<div class="date">${d}</div>`;
      // mark today
      const todayISO = formatISO(new Date());
      if (iso === todayISO){
        cell.classList.add("today");
      }
      // check holiday
      const holiday = state.holidaysComputed.find(h=>h.dateISO===iso);
      if (holiday){
        cell.classList.add("holiday");
        const em = document.createElement("div");
        em.className = "emoji";
        em.textContent = holiday.emoji || "🎉";
        cell.appendChild(em);
      } else {
        // weekend emoji (Saturday or Sunday)
        const wd = dateObj.getDay();
        if (wd === 0 || wd === 6){
          const em = document.createElement("div");
          em.className = "emoji";
          em.textContent = "🕺";
          cell.appendChild(em);
        }
      }
      // show events for this date
      const evs = getEventsForDate(iso);
      if (evs.length){
        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.textContent = evs[0].title;
        cell.appendChild(pill);
      }
      // click handler
      cell.addEventListener("click", ()=> onDateClick(iso));
    }
    cal.appendChild(cell);
  }

  // update month-year label
  const monNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("monthYear").textContent = `${monNames[state.viewMonth]} ${state.viewYear}`;
}

// format date to yyyy-mm-dd
function formatISO(d){
  const dt = new Date(d.getTime() - (d.getTimezoneOffset()*60000)); // align to local date
  return dt.toISOString().slice(0,10);
}

// prev/next
function changeMonth(delta){
  state.viewMonth += delta;
  if (state.viewMonth < 0){ state.viewMonth = 11; state.viewYear--; }
  if (state.viewMonth > 11){ state.viewMonth = 0; state.viewYear++; }
  renderCalendar();
  renderUpcoming();
}
function changeYear(delta){
  state.viewYear += delta;
  renderCalendar();
  renderUpcoming();
}
function goToToday(){
  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  renderCalendar();
  renderUpcoming();
}

// ---------- Date click: show options (add event / holiday details) ----------
function onDateClick(iso){
  const holiday = state.holidaysComputed.find(h=>h.dateISO===iso);
  const evs = getEventsForDate(iso);
  const dateObj = new Date(iso + "T00:00:00Z");
  const title = `${iso} — ${dateObj.toDateString()}`;
  openModal(title, buildModalBody(iso, holiday, evs), false, {iso});
}

function buildModalBody(iso, holiday, evs){
  const container = document.createElement("div");
  if (holiday){
    const h = document.createElement("div");
    h.innerHTML = `<strong>${holiday.emoji} ${holiday.name}</strong><p class="small">${holiday.description}</p>`;
    container.appendChild(h);
  }
  const evList = document.createElement("div");
  evList.style.marginTop = "8px";
  evList.innerHTML = `<div><strong>Events</strong></div>`;
  const ul = document.createElement("ul");
  ul.style.paddingLeft="14px";
  ul.style.marginTop="6px";
  if (evs.length===0){
    const li = document.createElement("li");
    li.textContent = "(No events)";
    ul.appendChild(li);
  } else {
    for (const e of evs){
      const li = document.createElement("li");
      li.textContent = `${e.title} (${e.createdAt || ""}) `;
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.style.marginLeft="8px";
      del.addEventListener("click", ()=>{
        deleteEvent(e.id);
        closeModal();
        renderCalendar();
        renderEventsList();
      });
      li.appendChild(del);
      ul.appendChild(li);
    }
  }
  container.appendChild(evList);
  container.appendChild(ul);

  // add quick-add form
  const form = document.createElement("div");
  form.innerHTML = `<hr><div><label>New event title</label><input id="modalEventTitle" placeholder="Event title" style="width:100%;padding:8px;margin-top:6px;border-radius:8px"></div>`;
  container.appendChild(form);
  return container;
}

// ---------- Modal helpers ----------
let modalState = {};
function openModal(title, bodyEl, showSave=true, meta={}){
  modalState.meta = meta || {};
  document.getElementById("modalTitle").textContent = title;
  const body = document.getElementById("modalBody");
  body.innerHTML = "";
  body.appendChild(bodyEl);
  document.getElementById("modalSave").style.display = showSave? "inline-block":"none";
  document.getElementById("modalBackdrop").classList.remove("hidden");
}
function closeModal(){
  document.getElementById("modalBackdrop").classList.add("hidden");
}
function modalSave(){
  // modal save used for adding event
  const titleInput = document.getElementById("modalEventTitle");
  if (!titleInput || !titleInput.value.trim()){
    // nothing entered: just close
    closeModal();
    return;
  }
  const title = titleInput.value.trim();
  const iso = modalState.meta.iso;
  addEvent(iso, title);
  closeModal();
  renderCalendar();
  renderEventsList();
}

// ---------- Events storage ----------
function loadEvents(){
  try {
    const raw = localStorage.getItem("namibia-widget-events");
    return raw ? JSON.parse(raw) : [];
  } catch (e){ return []; }
}
function saveEvents(){
  localStorage.setItem("namibia-widget-events", JSON.stringify(state.events));
}
function getEventsForDate(iso){
  return state.events.filter(e=>e.dateISO === iso);
}
function addEvent(iso, title){
  const ev = {
    id: "ev_" + Date.now(),
    dateISO: iso,
    title,
    createdAt: new Date().toLocaleString()
  };
  state.events.push(ev);
  saveEvents();
}
function deleteEvent(id){
  state.events = state.events.filter(e=>e.id!==id);
  saveEvents();
}
function renderEventsList(){
  const ul = document.getElementById("eventsList");
  ul.innerHTML = "";
  const evs = [...state.events].sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  if (evs.length===0){
    ul.innerHTML = "<li class='small'>No user events. Click a date to add one.</li>";
    return;
  }
  for (const e of evs){
    const li = document.createElement("li");
    li.innerHTML = `<strong>${e.title}</strong><div class="small">${e.dateISO} • ${e.createdAt}</div>`;
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.style.marginTop="6px";
    del.addEventListener("click", ()=>{ deleteEvent(e.id); renderCalendar(); renderEventsList();});
    li.appendChild(del);
    ul.appendChild(li);
  }
}
renderEventsList();

// ---------- Upcoming holidays rendering ----------
function renderUpcoming(){
  // compute upcoming relative to today's date
  const todayISO = formatISO(new Date());
  const arr = state.holidaysComputed
    .map(h=>({...h, dateISO: h.dateISO}))
    .sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  const upcoming = arr.filter(h=>h.dateISO >= todayISO).slice(0,6);
  const list = document.getElementById("upcomingList");
  list.innerHTML = "";
  if (upcoming.length === 0){
    list.innerHTML = "<li class='small'>No upcoming holidays this year.</li>";
    return;
  }
  for (const h of upcoming){
    const li = document.createElement("li");
    const d = new Date(h.dateISO + "T00:00:00Z");
    li.innerHTML = `<strong>${h.emoji} ${h.name}</strong><div class="small">${h.dateISO} • ${d.toDateString()}</div>`;
    li.addEventListener("click", ()=> openModal(`${h.name}`, buildHolidayModal(h), false));
    list.appendChild(li);
  }
}

function buildHolidayModal(h){
  const div = document.createElement("div");
  div.innerHTML = `<p><strong>${h.emoji} ${h.name}</strong></p><p class="small">${h.description || ""}</p>`;
  return div;
}

// ---------- Weather ----------
async function onSearch(){
  const q = document.getElementById("searchInput").value.trim();
  if (!q) return alert("Type a town or region name (e.g., Swakopmund, Walvis Bay, Keetmanshoop).");
  showRefreshingOverlay("Fetching weather...");
  await fetchWeatherByCity(q + ",NA"); // append country code to bias search to Namibia
  hideRefreshingOverlay();
}

async function fetchWeatherByCity(q){
  try {
    const url = `${WEATHER_API_BASE}?q=${encodeURIComponent(q)}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Weather fetch failed");
    const data = await r.json();
    renderWeatherData(data);
  } catch (err){
    console.error(err);
    alert("Failed to fetch weather. Check API key and network. See console for details.");
  }
}

async function fetchWeatherByCoords(lat, lon){
  try {
    const url = `${WEATHER_API_BASE}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Weather fetch failed");
    const data = await r.json();
    renderWeatherData(data);
  } catch (err){
    console.error(err);
    alert("Failed to fetch weather by coordinates.");
  }
}

function renderWeatherData(data){
  const name = `${data.name}, ${data.sys && data.sys.country ? data.sys.country : 'NA'}`;
  document.getElementById("locName").textContent = name;
  document.getElementById("temperature").textContent = `${Math.round(data.main.temp)}°C`;
  document.getElementById("feelsLike").textContent = `${Math.round(data.main.feels_like)}°C`;
  document.getElementById("wind").textContent = `${data.wind.speed} m/s`;
  document.getElementById("humidity").textContent = `${data.main.humidity}%`;
  document.getElementById("condition").textContent = data.weather[0].description;
  document.getElementById("weatherEmoji").textContent = mapWeatherToEmoji(data.weather[0].id, data.weather[0].main);
}

// Map OpenWeather weather codes to emoji
function mapWeatherToEmoji(code, main){
  // code is numeric ID, see OpenWeatherMap codes
  if (code >= 200 && code < 300) return "⛈️";
  if (code >= 300 && code < 600) return "🌧️";
  if (code >= 600 && code < 700) return "❄️";
  if (code >= 700 && code < 800) return "🌫️";
  if (code === 800) return "☀️";
  if (code === 801) return "🌤️";
  if (code === 802) return "⛅";
  if (code === 803 || code === 804) return "☁️";
  // fallback
  if (/rain/i.test(main)) return "🌧️";
  return "🌡️";
}

// ---------- Geolocation ----------
function geoLocate(){
  if (!navigator.geolocation) return alert("Geolocation not supported in this browser.");
  showRefreshingOverlay("Detecting location...");
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const {latitude, longitude} = pos.coords;
    await fetchWeatherByCoords(latitude, longitude);
    hideRefreshingOverlay();
  }, (err)=>{
    hideRefreshingOverlay();
    alert("Location access denied or failed.");
  }, {timeout:10000});
}

// ---------- Time & Countdown ----------
function startClock(){
  function tick(){
    const now = new Date();
    const bits = now.toLocaleString([], {weekday:'short',year:'numeric',month:'short',day:'numeric'});
    const time = now.toLocaleTimeString();
    document.getElementById("liveDateTime").textContent = `${bits} • ${time}`;
    requestAnimationFrame(()=>setTimeout(tick, 1000));
  }
  tick();
}

function startCountdown(){
  function update(){
    const now = new Date();
    // target: next Friday 00:00 local time (if today is Friday but after 00:00, it's this Friday)
    let target = nextFridayAt(0,0,0);
    const diff = target - now;
    if (diff <= 0){
      document.getElementById("countdown").textContent = "It's Friday! 🎉";
    } else {
      const days = Math.floor(diff / (24*3600*1000));
      const hrs = Math.floor((diff % (24*3600*1000)) / (3600*1000));
      const mins = Math.floor((diff % (3600*1000)) / (60*1000));
      const secs = Math.floor((diff % (60*1000)) / 1000);
      document.getElementById("countdown").textContent = `${days}d ${hrs}h ${mins}m ${secs}s`;
    }
    setTimeout(update, 1000);
  }
  update();
}

function nextFridayAt(hour, minute, second){
  const now = new Date();
  const today = now.getDay(); // 0 Sun .. 5 Fri ..6 Sat
  const daysUntilFriday = (5 - today + 7) % 7;
  let target = new Date(now);
  target.setDate(now.getDate() + daysUntilFriday);
  target.setHours(hour, minute, second, 0);
  // if today is Friday and time has passed, go to next week
  if (daysUntilFriday === 0 && now >= target){
    target.setDate(target.getDate() + 7);
  }
  return target;
}

// ---------- Refresh UI ----------
function showRefreshingOverlay(msg="Refreshing..."){
  const over = document.getElementById("refreshOverlay");
  over.textContent = msg;
  over.classList.remove("hidden");
}
function hideRefreshingOverlay(){
  document.getElementById("refreshOverlay").classList.add("hidden");
}

async function refreshEverything(){
  showRefreshingOverlay("Refreshing all data...");
  // quick visual delay to show the overlay
  try {
    await loadHolidays();
    renderCalendar();
    renderUpcoming();
    renderEventsList();
    // refresh current weather by reusing existing location name
    const name = document.getElementById("locName").textContent || DEFAULT_CITY;
    await fetchWeatherByCity(name);
  } catch (e) {
    console.warn(e);
  }
  setTimeout(()=>hideRefreshingOverlay(), 800);
}

// ---------- Mode Toggle ----------
function toggleMode(){
  const body = document.body;
  if (body.classList.contains("dark")){
    body.classList.remove("dark");
    body.classList.add("light");
    document.getElementById("modeToggle").textContent = "🌙";
  } else {
    body.classList.remove("light");
    body.classList.add("dark");
    document.getElementById("modeToggle").textContent = "☀️";
  }
}

// ---------- Events & UI helpers ----------
function onDateToISO(dateLike){
  return formatISO(new Date(dateLike));

function openAddEventModalForDate(date){
  const iso = formatISO(date);
  modalState.meta = {iso};
  const title = `Add event • ${iso}`;
  
  const inputEl = document.createElement("input");
  inputEl.id = "modalEventTitle";
  inputEl.placeholder = "Event title";
  inputEl.style = "width:100%;padding:8px;margin-top:6px;border-radius:8px";
  
  inputEl.addEventListener("keypress", (e) => {
    if(e.key === "Enter") modalSave();
  });
  
  const container = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = "Event title";
  container.appendChild(label);
  container.appendChild(inputEl);
  
  openModal(title, container, true, {iso});
}

  openModal(title, body, true, {iso});
}



// load events list on start
renderEventsList();
 // Namibia Info Widget script
// Replace with your OpenWeatherMap API key
const OWM_KEY = "YOUR_OPENWEATHERMAP_API_KEY"; // <-- put your API key here
const DEFAULT_CITY = "Windhoek,NA";

// --- DOM refs
const localTimeEl = document.getElementById("localTime");
const tempEl = document.getElementById("temp");
const condEl = document.getElementById("conditions");
const locNameEl = document.getElementById("locName");
const weatherEmojiEl = document.getElementById("weatherEmoji");
const humidityEl = document.getElementById("humidity");
const windEl = document.getElementById("wind");
const sunTimesEl = document.getElementById("sunTimes");

const weatherPanel = document.getElementById("weatherPanel");
const calendarPanel = document.getElementById("calendarPanel");
const countdownPanel = document.getElementById("countdownPanel");

const btnWeather = document.getElementById("btnWeather");
const btnCalendar = document.getElementById("btnCalendar");
const btnCountdown = document.getElementById("btnCountdown");

const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");
const monthYearEl = document.getElementById("monthYear");
const calendarGrid = document.getElementById("calendar");

const themeToggle = document.getElementById("themeToggle");
const refreshWeatherBtn = document.getElementById("refreshWeather");

const noteModal = document.getElementById("noteModal");
const noteText = document.getElementById("noteText");
const noteModalTitle = document.getElementById("noteModalTitle");
const saveNoteBtn = document.getElementById("saveNote");
const deleteNoteBtn = document.getElementById("deleteNote");
const closeModalBtn = document.getElementById("closeModal");

const countdownEl = document.getElementById("countdown");

// panel nav
btnWeather.addEventListener("click", ()=>showPanel("weather"));
btnCalendar.addEventListener("click", ()=>showPanel("calendar"));
btnCountdown.addEventListener("click", ()=>showPanel("countdown"));

function showPanel(name){
  weatherPanel.classList.remove("visible");
  calendarPanel.classList.remove("visible");
  countdownPanel.classList.remove("visible");
  if(name==="weather") weatherPanel.classList.add("visible");
  if(name==="calendar") calendarPanel.classList.add("visible");
  if(name==="countdown") countdownPanel.classList.add("visible");
}

// initial
showPanel("weather");

// theme
themeToggle.addEventListener("change", () => {
  document.body.classList.toggle("dark", themeToggle.checked);
});

// Live clock using machine time (local)
function updateLocalTime(){
  const now = new Date();
  localTimeEl.textContent = now.toLocaleTimeString();
}
setInterval(updateLocalTime, 1000);
updateLocalTime();

// -------------- WEATHER --------------
async function fetchWeather(){
  if(!OWM_KEY || OWM_KEY==="YOUR_OPENWEATHERMAP_API_KEY"){
    applyFallbackWeather();
    return;
  }

  try{
    const q = encodeURIComponent(DEFAULT_CITY);
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&units=metric&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();
    renderWeather(data);
  }catch(e){
    console.warn("Weather failed:", e);
    applyFallbackWeather();
  }
}

function applyFallbackWeather(){
  locNameEl.textContent = "Windhoek, NA";
  tempEl.textContent = "24°C";
  condEl.textContent = "Partly Cloudy";
  weatherEmojiEl.textContent = "⛅";
  humidityEl.textContent = "45%";
  windEl.textContent = "3 m/s";
  sunTimesEl.textContent = "-- / --";
}

function renderWeather(data){
  const t = Math.round(data.main.temp);
  tempEl.textContent = `${t}°C`;
  condEl.textContent = `${data.weather[0].description}`;
  locNameEl.textContent = `${data.name}, ${data.sys?.country || "NA"}`;
  humidityEl.textContent = `${data.main.humidity}%`;
  windEl.textContent = `${data.wind.speed} m/s`;
  const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
  const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString();
  sunTimesEl.textContent = `${sunrise} / ${sunset}`;

  weatherEmojiEl.textContent = weatherEmojiFromId(data.weather[0].id);
}

function weatherEmojiFromId(id){
  // map OpenWeather codes to emoji
  if(id >= 200 && id < 300) return "⛈️";
  if(id >= 300 && id < 600) return "🌧️";
  if(id >= 600 && id < 700) return "❄️";
  if(id >= 700 && id < 800) return "🌫️";
  if(id === 800) return "☀️";
  if(id === 801) return "🌤️";
  if(id === 802) return "⛅";
  if(id === 803 || id === 804) return "☁️";
  return "🌤️";
}

refreshWeatherBtn.addEventListener("click", fetchWeather);
fetchWeather();

// -------------- HOLIDAYS (Namibia) --------------
// We include fixed-date holidays and compute those tied to Easter (Good Friday, Easter Monday, Ascension)
function easterSunday(year){
  // Meeus/Jones algorithm (valid for Gregorian calendar)
  const a = year % 19;
  const b = Math.floor(year/100);
  const c = year % 100;
  const d = Math.floor(b/4);
  const e = b % 4;
  const f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c/4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l)/451);
  const month = Math.floor((h + l - 7*m + 114)/31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month-1, day);
}

function addDays(d, days){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+days); }

// build holiday list for a given year
function getNamibiaHolidays(year){
  const list = [];

  // fixed
  const fixed = [
    {m:0,d:1,name:"New Year's Day"},
    {m:2,d:21,name:"Independence Day"},
    {m:4,d:1,name:"Workers' Day"},
    {m:4,d:4,name:"Cassinga Day"}, // May 4
    {m:4,d:25,name:"Africa Day"},
    {m:4,d:28,name:"Genocide Remembrance Day"},
    {m:7,d:26,name:"Heroes' Day"},
    {m:11,d:10,name:"Day of the Namibian Women / Human Rights Day"},
    {m:11,d:25,name:"Christmas Day"},
    {m:11,d:26,name:"Family Day"}
  ];
  fixed.forEach(f=> list.push({date:new Date(year,f.m,f.d),name:f.name}));

  // Sometimes additional ceremonial public holidays occur (e.g., Feb 28, Mar 1) — commonly included in resources.

  // Easter-based
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);
  list.push({date:goodFriday, name:"Good Friday"});
  list.push({date:easterMonday, name:"Easter Monday"});

  // Ascension Day: 39 days after Easter Sunday
  const ascension = addDays(easter, 39);
  list.push({date:ascension, name:"Ascension Day"});

  // If holiday falls on Sunday, Namibia observes the next Monday (public holiday in lieu).
  // We'll generate "observed" days automatically: if any holiday is Sunday, add observed Monday.
  const observed = [];
  list.forEach(h=>{
    const dow = h.date.getDay();
    if(dow === 0){ // Sunday
      const obs = addDays(h.date, 1);
      observed.push({date:obs, name: h.name + " (observed)"});
    }
  });
  return list.concat(observed);
}

// -------------- CALENDAR UI --------------
let viewDate = new Date(); // date representing the current calendar view (first of month)
viewDate.setDate(1);

function renderCalendar(){
  calendarGrid.innerHTML = "";
  // weekday labels
  const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for(let w of weekdays){
    const lbl = document.createElement("div");
    lbl.className = "weekday-label";
    lbl.textContent = w;
    calendarGrid.appendChild(lbl);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  monthYearEl.textContent = `${viewDate.toLocaleString(undefined,{month:"long"})} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  // previous month's trailing days count
  const prevMonthDays = new Date(year, month, 0).getDate();

  // holidays for year
  const holidays = getNamibiaHolidays(year).map(h=>({
    key: dateKey(h.date), name:h.name
  }));
  const holidayMap = {};
  holidays.forEach(h=>holidayMap[h.key]=h.name);

  // fill grid: total boxes = weekday labels (7) + day cells; but we already added labels separately, so just render day cells 7x6
  const totalCells = 7*6;
  for(let i=0;i<totalCells;i++){
    const cell = document.createElement("div");
    cell.className = "day-cell";

    const cellIndex = i;
    const dayNum = i - startDow + 1;
    let cellDate;
    if(i < startDow){
      // previous month
      const d = prevMonthDays - (startDow - 1 - i);
      cell.classList.add("other-month");
      cellDate = new Date(year, month-1, d);
    } else if(dayNum > daysInMonth){
      // next month
      cell.classList.add("other-month");
      cellDate = new Date(year, month+1, dayNum - daysInMonth);
    } else {
      cellDate = new Date(year, month, dayNum);
    }

    const dayNumEl = document.createElement("div");
    dayNumEl.className = "day-num";
    dayNumEl.textContent = cellDate.getDate();
    cell.appendChild(dayNumEl);

    // mark weekend with dancing emoji (Saturday=6 Sunday=0)
    const dow = cellDate.getDay();
    if(dow===0 || dow===6){
      const wEmoji = document.createElement("div");
      wEmoji.className = "weekend-emoji";
      wEmoji.textContent = "💃";
      cell.appendChild(wEmoji);
    }

    // holiday check
    const key = dateKey(cellDate);
    if(holidayMap[key]){
      cell.classList.add("holiday");
      const hEmoji = document.createElement("div");
      hEmoji.style.position = "absolute";
      hEmoji.style.right = "8px";
      hEmoji.style.bottom = "8px";
      hEmoji.textContent = "🎉";
      cell.appendChild(hEmoji);

      const title = document.createElement("div");
      title.style.fontSize = "12px";
      title.style.marginTop = "26px";
      title.textContent = holidayMap[key];
      cell.appendChild(title);
    }

    // saved note indicator
    const note = loadNoteForDate(key);
    if(note){
      const mark = document.createElement("div");
      mark.className = "mark-dot";
      mark.textContent = "📝";
      cell.appendChild(mark);
    }

    // click to add / edit mark
    cell.addEventListener("click", ()=>{
      openNoteModal(cellDate);
    });

    calendarGrid.appendChild(cell);
  }
}

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

prevMonthBtn.addEventListener("click", ()=>{
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1);
  renderCalendar();
});
nextMonthBtn.addEventListener("click", ()=>{
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 1);
  renderCalendar();
});

renderCalendar();

// -------------- Notes (localStorage) --------------
function loadNoteForDate(key){
  const notes = JSON.parse(localStorage.getItem("niw_notes") || "{}");
  return notes[key] || null;
}
function saveNoteForDate(key, text){
  const notes = JSON.parse(localStorage.getItem("niw_notes") || "{}");
  if(text && text.trim().length>0) notes[key] = text.trim();
  else delete notes[key];
  localStorage.setItem("niw_notes", JSON.stringify(notes));
  renderCalendar();
}

// modal logic
let modalDateKey = null;
function openNoteModal(date){
  modalDateKey = dateKey(date);
  const note = loadNoteForDate(modalDateKey);
  noteText.value = note || "";
  noteModalTitle.textContent = `Note — ${modalDateKey}`;
  noteModal.classList.remove("hidden");
}
saveNoteBtn.addEventListener("click", ()=>{
  saveNoteForDate(modalDateKey, noteText.value);
  noteModal.classList.add("hidden");
});
deleteNoteBtn.addEventListener("click", ()=>{
  saveNoteForDate(modalDateKey, "");
  noteModal.classList.add("hidden");
});
closeModalBtn.addEventListener("click", ()=> noteModal.classList.add("hidden"));

// -------------- WEEKEND COUNTDOWN --------------
function updateCountdown(){
  const now = new Date();
  const year = now.getFullYear();
  // find upcoming Friday at 17:00
  const target = new Date(now);
  // set to this week's Friday
  const curDow = now.getDay();
  const daysToFri = (5 - curDow + 7) % 7; // 5 == Friday
  target.setDate(now.getDate() + daysToFri);
  target.setHours(17,0,0,0);
  // if we are already past this Friday 17:00, jump to next week's Friday
  if(target <= now){
    target.setDate(target.getDate() + 7);
  }
  const diffMs = target - now;
  const diffDays = Math.floor(diffMs / (1000*60*60*24));
  const hrs = Math.floor((diffMs % (1000*60*60*24)) / (1000*60*60));
  const mins = Math.floor((diffMs % (1000*60*60)) / (1000*60));
  const secs = Math.floor((diffMs % (1000*60)) / 1000);
  countdownEl.textContent = `${diffDays} days ${String(hrs).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
}
setInterval(updateCountdown, 1000);
updateCountdown();

// -------------- Helpers --------------
/* Ensure when view changes we re-render */
window.addEventListener("focus", ()=>{ updateLocalTime(); renderCalendar(); });

// On load: make calendar visible by default in the center
// (weather already asked for data)

