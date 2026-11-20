let rooms = [];
let bookings = [];
let myBookings = [];
let matchingRooms = [];
let hasSearched = false;
let activeSearch = null;
let bookingStorageError = "";

const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const bookingsStorageKey = "roomradar.userBookings";

async function loadData() {
    const response = await fetch("/data_set.json");
    if (!response.ok) {
        throw new Error(`Could not load campus data (${response.status}).`);
    }

    const data = await response.json();
    if (!Array.isArray(data.rooms) || !Array.isArray(data.bookings)) {
        throw new Error("Campus data is missing its rooms or bookings list.");
    }

    rooms = data.rooms;
    bookings = [...data.bookings];
    myBookings = [];
    bookingStorageError = "";
    try {
        loadSavedBookings();
    } catch (error) {
        bookings = [...data.bookings];
        myBookings = [];
        bookingStorageError = error.message;
    }

    document.getElementById("stat-rooms").textContent = String(rooms.length);
    document.getElementById("stat-buildings").textContent = String(new Set(rooms.map((room) => room.building)).size);
    document.getElementById("stat-bookings").textContent = String(bookings.length);

    populateSelect("user-building", [...new Set(rooms.map((room) => room.building))].sort(), "Any building");
    populateSelect("user-type", [...new Set(rooms.map((room) => room.type))].sort(), "Any type");
    populateSelect("user-day", weekdayOrder, "Select a day");
    renderBookings();
    renderSchedule();
    if (bookingStorageError) {
        showBookingFeedback(`Saved bookings could not be loaded: ${bookingStorageError}`, true);
    }
}

function loadSavedBookings() {
    const savedBookings = localStorage.getItem(bookingsStorageKey);
    if (!savedBookings) {
        return;
    }

    const parsedBookings = JSON.parse(savedBookings);
    if (!Array.isArray(parsedBookings)) {
        throw new Error("Saved bookings data is not a list.");
    }

    parsedBookings.forEach((booking) => {
        const roomExists = rooms.some((room) => room.id === booking.roomId);
        if (
            typeof booking.id !== "string" ||
            !roomExists ||
            !weekdayOrder.includes(booking.day) ||
            !isValidTime(booking.start) ||
            !isValidTime(booking.end) ||
            timeToMinutes(booking.end) <= timeToMinutes(booking.start) ||
            isRoomBusy(booking.roomId, booking.day, booking.start, booking.end)
        ) {
            throw new Error("A saved booking is invalid or conflicts with another booking.");
        }
        bookings.push(booking);
        myBookings.push(booking);
    });
}

function populateSelect(id, values, placeholder) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option(placeholder, ""));
    values.forEach((value) => select.add(new Option(value, value)));
}

function timeToMinutes(time) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

function isValidTime(time) {
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
        return false;
    }

    const [hour, minute] = time.split(":").map(Number);
    return hour < 24 && minute < 60;
}

function isRoomBusy(roomId, day, start, end) {
    const requestedStart = timeToMinutes(start);
    const requestedEnd = timeToMinutes(end);

    return bookings.some((booking) => {
        if (booking.roomId !== roomId || booking.day !== day) {
            return false;
        }

        if (!isValidTime(booking.start) || !isValidTime(booking.end)) {
            return true;
        }

        return timeToMinutes(booking.start) < requestedEnd && timeToMinutes(booking.end) > requestedStart;
    });
}

function searchRooms(day, start, end, filters) {
    return rooms.filter((room) =>
        !isRoomBusy(room.id, day, start, end) &&
        (!filters.building || room.building === filters.building) &&
        (!filters.type || room.type === filters.type) &&
        (!filters.capacity || room.capacity >= Number(filters.capacity))
    );
}

function showBookingFeedback(message, isError) {
    const feedback = document.getElementById("booking-feedback");
    feedback.textContent = message;
    feedback.classList.toggle("text-red-700", isError);
    feedback.classList.toggle("text-slate-600", !isError);
}

function renderBookings() {
    const container = document.getElementById("bookings-list");
    const emptyState = document.getElementById("bookings-empty");
    container.replaceChildren();
    emptyState.classList.toggle("hidden", myBookings.length > 0);

    myBookings
        .slice()
        .sort((a, b) => weekdayOrder.indexOf(a.day) - weekdayOrder.indexOf(b.day) || timeToMinutes(a.start) - timeToMinutes(b.start))
        .forEach((booking) => {
            const room = rooms.find((item) => item.id === booking.roomId);
            const card = document.createElement("article");
            card.className = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
            card.dataset.userBooking = "";

            const title = document.createElement("h2");
            title.className = "font-bold text-slate-950";
            title.textContent = room.name;
            const building = document.createElement("p");
            building.className = "mt-2 text-sm text-slate-500";
            building.textContent = `${room.building} · Floor ${room.floor}`;
            const time = document.createElement("p");
            time.className = "mt-3 text-sm font-medium text-slate-700";
            time.textContent = `${booking.day}, ${booking.start}–${booking.end}`;
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.dataset.cancelBooking = booking.id;
            cancel.className = "mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700";
            cancel.textContent = "Cancel booking";

            card.append(title, building, time, cancel);
            container.append(card);
        });
}

function renderSchedule() {
    const container = document.getElementById("schedule-list");
    container.replaceChildren();

    weekdayOrder.forEach((day) => {
        const dayBookings = bookings
            .filter((booking) => booking.day === day)
            .sort((a, b) => {
                const aHasTime = isValidTime(a.start);
                const bHasTime = isValidTime(b.start);
                if (!aHasTime || !bHasTime) {
                    return Number(!aHasTime) - Number(!bHasTime);
                }
                return timeToMinutes(a.start) - timeToMinutes(b.start);
            });
        const section = document.createElement("section");
        section.className = "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm";
        const toggle = document.createElement("button");
        const panelId = `schedule-day-${day.toLowerCase()}`;
        toggle.type = "button";
        toggle.dataset.toggleDay = "";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", panelId);
        toggle.className = "flex w-full items-center justify-between gap-3 p-5 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-900/10";
        const heading = document.createElement("span");
        heading.className = "font-bold text-slate-950";
        heading.textContent = day;
        const daySummary = document.createElement("span");
        daySummary.className = "flex items-center gap-3";
        const count = document.createElement("span");
        count.className = "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600";
        count.textContent = `${dayBookings.length} ${dayBookings.length === 1 ? "session" : "sessions"}`;
        const indicator = document.createElement("span");
        indicator.className = "text-slate-400";
        indicator.dataset.dayIndicator = "";
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = "+";
        daySummary.append(count, indicator);
        toggle.append(heading, daySummary);
        const panel = document.createElement("div");
        panel.id = panelId;
        panel.className = "border-t border-slate-100 px-5";
        panel.hidden = true;

        if (dayBookings.length === 0) {
            const empty = document.createElement("p");
            empty.className = "py-4 text-sm text-slate-500";
            empty.textContent = "No sessions scheduled.";
            panel.append(empty);
        }

        dayBookings.forEach((booking) => {
            const room = rooms.find((item) => item.id === booking.roomId);
            const entry = document.createElement("div");
            entry.className = "border-t border-slate-100 py-3 first:border-t-0";
            const title = document.createElement("p");
            title.className = "text-sm font-semibold text-slate-900";
            title.textContent = room.name;
            const details = document.createElement("p");
            details.className = "mt-1 text-xs text-slate-500";
            const time = isValidTime(booking.start) && isValidTime(booking.end)
                ? `${booking.start}–${booking.end}`
                : "Time unavailable";
            details.textContent = `${time} · ${room.building}`;
            entry.append(title, details);

            if (myBookings.includes(booking)) {
                const badge = document.createElement("span");
                badge.className = "mt-2 inline-block rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900";
                badge.textContent = "Your booking";
                entry.append(badge);
            }
            panel.append(entry);
        });
        section.append(toggle, panel);
        container.append(section);
    });
}

function renderResults() {
    const container = document.getElementById("result");
    const emptyState = document.getElementById("results-empty");
    const count = document.getElementById("results-count");
    const summary = document.getElementById("results-summary");
    const query = document.getElementById("room-search").value.trim().toLowerCase();
    const visibleRooms = matchingRooms.filter((room) =>
        `${room.name} ${room.building} ${room.type}`.toLowerCase().includes(query)
    );

    container.querySelectorAll("[data-room-card]").forEach((card) => card.remove());
    count.classList.remove("hidden");
    count.textContent = `${visibleRooms.length} ${visibleRooms.length === 1 ? "space" : "spaces"}`;

    if (visibleRooms.length === 0) {
        emptyState.classList.remove("hidden");
        document.getElementById("empty-title").textContent = hasSearched ? "No rooms match those filters." : "Your next open space is waiting.";
        document.getElementById("empty-message").textContent = query
            ? "Try a different room name or building."
            : "Try another time or adjust your filters.";
        summary.textContent = query ? `No matches for “${document.getElementById("room-search").value.trim()}”.` : "Try adjusting your search to see more spaces.";
        return;
    }

    emptyState.classList.add("hidden");
    summary.textContent = query ? "Showing rooms that match your search." : "Rooms available for your selected time.";

    visibleRooms.forEach((room) => {
        const card = document.createElement("article");
        card.dataset.roomCard = "";
        card.className = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md";

        const top = document.createElement("div");
        top.className = "flex items-start justify-between gap-3";
        const title = document.createElement("h3");
        title.className = "font-bold tracking-tight text-slate-950";
        title.textContent = room.name;
        const available = document.createElement("span");
        available.className = "shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700";
        available.textContent = "Available";
        top.append(title, available);

        const building = document.createElement("p");
        building.className = "mt-2 text-sm text-slate-500";
        building.textContent = room.building;

        const details = document.createElement("div");
        details.className = "mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4";
        const type = document.createElement("span");
        type.className = "rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-900";
        type.textContent = room.type;
        const capacity = document.createElement("span");
        capacity.className = "rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600";
        capacity.textContent = `Up to ${room.capacity}`;
        const floor = document.createElement("span");
        floor.className = "rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600";
        floor.textContent = `Floor ${room.floor}`;
        details.append(type, capacity, floor);

        const bookButton = document.createElement("button");
        bookButton.type = "button";
        bookButton.dataset.bookRoom = String(room.id);
        bookButton.className = "mt-4 w-full rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-900";
        bookButton.textContent = "Book this room";
        bookButton.disabled = Boolean(bookingStorageError);
        bookButton.classList.toggle("cursor-not-allowed", bookButton.disabled);
        bookButton.classList.toggle("opacity-50", bookButton.disabled);
        card.append(top, building, details, bookButton);
        container.append(card);
    });
}

function bookRoom(roomId) {
    if (bookingStorageError) {
        showBookingFeedback(`Booking is unavailable because saved bookings could not be loaded: ${bookingStorageError}`, true);
        activateTab("bookings", false);
        return;
    }

    const room = rooms.find((item) => String(item.id) === roomId);
    if (!room || !activeSearch) {
        return;
    }

    const { day, start, end } = activeSearch;
    if (isRoomBusy(room.id, day, start, end)) {
        showBookingFeedback("That room is no longer available for the selected time. Search again.", true);
        activateTab("bookings", false);
        return;
    }

    const booking = {
        id: globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        roomId: room.id,
        day,
        start,
        end
    };
    const updatedBookings = [...myBookings, booking];
    try {
        localStorage.setItem(bookingsStorageKey, JSON.stringify(updatedBookings));
    } catch (error) {
        showBookingFeedback(`Could not save your booking: ${error.message}`, true);
        activateTab("bookings", false);
        return;
    }

    myBookings = updatedBookings;
    bookings.push(booking);
    document.getElementById("stat-bookings").textContent = String(bookings.length);
    matchingRooms = searchRooms(day, start, end, activeSearch.filters);
    renderResults();
    renderBookings();
    renderSchedule();
    showBookingFeedback(`${room.name} is booked for ${day}, ${start}–${end}.`, false);
    activateTab("bookings", false);
}

function cancelBooking(bookingId) {
    const booking = myBookings.find((item) => item.id === bookingId);
    if (!booking) {
        return;
    }

    const updatedBookings = myBookings.filter((item) => item.id !== bookingId);
    try {
        localStorage.setItem(bookingsStorageKey, JSON.stringify(updatedBookings));
    } catch (error) {
        showBookingFeedback(`Could not cancel the booking: ${error.message}`, true);
        return;
    }

    myBookings = updatedBookings;
    bookings = bookings.filter((item) => item !== booking);
    document.getElementById("stat-bookings").textContent = String(bookings.length);
    if (activeSearch) {
        matchingRooms = searchRooms(activeSearch.day, activeSearch.start, activeSearch.end, activeSearch.filters);
        renderResults();
    }
    renderBookings();
    renderSchedule();
    showBookingFeedback("Booking cancelled.", false);
}

function activateTab(tabName, focusTab) {
    document.querySelectorAll("[data-tab]").forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive && focusTab) {
            tab.focus();
        }
    });

    document.querySelectorAll("[data-panel]").forEach((panel) => {
        const isActive = panel.dataset.panel === tabName;
        panel.hidden = !isActive;
        panel.classList.toggle("hidden", !isActive);
    });
}

async function startApp() {
    const form = document.getElementById("room-finder");
    const endTimeInput = document.getElementById("end-time");

    document.querySelectorAll("[data-tab]").forEach((tab) => {
        tab.addEventListener("click", () => activateTab(tab.dataset.tab, false));
        tab.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
            }

            event.preventDefault();
            const tabs = [...document.querySelectorAll("[data-tab]")];
            const currentIndex = tabs.indexOf(tab);
            const offset = event.key === "ArrowRight" ? 1 : -1;
            const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
            activateTab(nextTab.dataset.tab, true);
        });
    });
    document.querySelectorAll("[data-go-home]").forEach((button) => {
        button.addEventListener("click", () => activateTab("home", false));
    });
    document.getElementById("result").addEventListener("click", (event) => {
        const button = event.target.closest("[data-book-room]");
        if (button) {
            bookRoom(button.dataset.bookRoom);
        }
    });
    document.getElementById("bookings-list").addEventListener("click", (event) => {
        const button = event.target.closest("[data-cancel-booking]");
        if (button) {
            cancelBooking(button.dataset.cancelBooking);
        }
    });
    document.getElementById("schedule-list").addEventListener("click", (event) => {
        const button = event.target.closest("[data-toggle-day]");
        if (!button) {
            return;
        }

        const expanded = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(expanded));
        document.getElementById(button.getAttribute("aria-controls")).hidden = !expanded;
        button.querySelector("[data-day-indicator]").textContent = expanded ? "-" : "+";
    });
    document.getElementById("room-search").addEventListener("input", () => {
        if (hasSearched) {
            renderResults();
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        endTimeInput.setCustomValidity("");

        const start = document.getElementById("start-time").value;
        const end = endTimeInput.value;
        if (start && end && timeToMinutes(end) <= timeToMinutes(start)) {
            endTimeInput.setCustomValidity("Choose an end time after the start time.");
        }
        if (!form.reportValidity()) {
            return;
        }

        const filters = {
            building: document.getElementById("user-building").value,
            type: document.getElementById("user-type").value,
            capacity: document.getElementById("user-capacity").value
        };
        activeSearch = {
            day: document.getElementById("user-day").value,
            start,
            end,
            filters
        };
        matchingRooms = searchRooms(activeSearch.day, start, end, filters);
        hasSearched = true;
        renderResults();
    });

    endTimeInput.addEventListener("input", () => endTimeInput.setCustomValidity(""));

    try {
        await loadData();
    } catch (error) {
        console.error("RoomRadar could not load campus data.", error);
        document.getElementById("results-summary").textContent = "Campus data could not be loaded.";
        document.getElementById("empty-title").textContent = "We couldn’t load campus spaces.";
        document.getElementById("empty-message").textContent = error.message;
        document.getElementById("search_button").disabled = true;
        document.getElementById("search_button").classList.add("cursor-not-allowed", "opacity-50");
    }
}

startApp();
