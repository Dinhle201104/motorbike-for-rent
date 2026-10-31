/**
 * MOTORBIKE FOR RENT - CALENDAR & TIMELINE ENGINE
 * Renders Monthly Grid View and Vehicle-vs-Days Matrix View.
 * Displays rental dates & time ranges + Days of week (Thứ 2 - Chủ Nhật).
 */

window.MocCarCalendar = {
  currentDate: new Date(),
  currentViewMode: 'grid', // 'grid' or 'matrix'

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    const todayBtn = document.getElementById('cal-today');

    if (prevBtn) prevBtn.addEventListener('click', () => this.changeMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => this.changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', () => {
      this.currentDate = new Date();
      this.render();
    });

    const toggleGridBtn = document.getElementById('btn-view-grid');
    const toggleMatrixBtn = document.getElementById('btn-view-matrix');

    if (toggleGridBtn && toggleMatrixBtn) {
      toggleGridBtn.addEventListener('click', () => {
        this.currentViewMode = 'grid';
        toggleGridBtn.classList.add('active');
        toggleMatrixBtn.classList.remove('active');
        this.render();
      });

      toggleMatrixBtn.addEventListener('click', () => {
        this.currentViewMode = 'matrix';
        toggleMatrixBtn.classList.add('active');
        toggleGridBtn.classList.remove('active');
        this.render();
      });
    }
  },

  changeMonth(delta) {
    this.currentDate.setMonth(this.currentDate.getMonth() + delta);
    this.render();
  },

  render() {
    const monthLabel = document.getElementById('cal-month-display');
    if (monthLabel) {
      const monthNames = [
        'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
      ];
      monthLabel.textContent = `${monthNames[this.currentDate.getMonth()]} / ${this.currentDate.getFullYear()}`;
    }

    const gridContainer = document.getElementById('calendar-grid-wrapper');
    const matrixContainer = document.getElementById('calendar-matrix-wrapper');

    if (this.currentViewMode === 'grid') {
      if (gridContainer) gridContainer.style.display = 'block';
      if (matrixContainer) matrixContainer.style.display = 'none';
      this.renderMonthGrid();
    } else {
      if (gridContainer) gridContainer.style.display = 'none';
      if (matrixContainer) matrixContainer.style.display = 'block';
      this.renderMatrixTimeline();
    }
  },

  renderMonthGrid() {
    const grid = document.getElementById('calendar-month-grid');
    if (!grid) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    // Headers for Days of the Week
    let html = `
      <div class="calendar-day-header">Thứ 2</div>
      <div class="calendar-day-header">Thứ 3</div>
      <div class="calendar-day-header">Thứ 4</div>
      <div class="calendar-day-header">Thứ 5</div>
      <div class="calendar-day-header">Thứ 6</div>
      <div class="calendar-day-header">Thứ 7</div>
      <div class="calendar-day-header" style="color: var(--status-cancel-text);">Chủ Nhật</div>
    `;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Get day index (0 = Mon, 6 = Sun)
    let startDayIdx = firstDayOfMonth.getDay() - 1;
    if (startDayIdx === -1) startDayIdx = 6;

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const today = new Date();

    const rentals = window.MocCarStore.getRentals();

    // Render cells from previous month
    for (let i = startDayIdx - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      html += `<div class="calendar-day-cell other-month">
        <div class="day-number">${dayNum}</div>
      </div>`;
    }

    // Render cells for current month
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const dateObj = new Date(year, month, day);
      const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const todayClass = isToday ? 'today' : '';

      const dayOfWeekShort = this.getDayOfWeekShort(dateObj.getDay());

      const cellDateStart = new Date(year, month, day, 0, 0, 0);
      const cellDateEnd = new Date(year, month, day, 23, 59, 59);

      const dayRentals = rentals.filter(r => {
        if (r.status === 'Đã Hủy') return false;
        const pDate = new Date(r.pickupDate);
        const rDate = new Date(r.returnDate);
        return pDate <= cellDateEnd && rDate >= cellDateStart;
      });

      html += `
        <div class="calendar-day-cell ${todayClass}">
          <div class="day-number">
            <span><strong>${day}</strong> <span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">(${dayOfWeekShort})</span></span>
            <button class="day-add-btn" onclick="window.MocCarCalendar.onQuickAdd('${cellDateStr}')" title="Đặt xe cho ngày này (${dayOfWeekShort}, ${day}/${month + 1})">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div class="day-rentals-container">
            ${dayRentals.map(r => {
              const pillClass = this.getPillStatusClass(r.status);
              const pickupFmt = this.formatShortDateTime(r.pickupDate);
              const returnFmt = this.formatShortDateTime(r.returnDate);
              const phoneStr = r.customerPhone ? ` (${r.customerPhone})` : '';
              const fullTooltip = `${r.carName} (${r.bks})\nKhách: ${r.customerName}${phoneStr}\nNhận: ${this.formatFullDateTimeWithDay(r.pickupDate)}\nTrả: ${this.formatFullDateTimeWithDay(r.returnDate)}`;

              return `
                <div class="rental-pill ${pillClass}" onclick="window.MocCarBooking.openQuickView('${r.id}')" title="${this.escapeHtml(fullTooltip)}">
                  <div style="display:flex; flex-direction:column; overflow:hidden;">
                    <div style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                      <i class="fas fa-motorcycle"></i> ${r.bks} - ${this.escapeHtml(r.customerName)}
                    </div>
                    <div style="font-size:0.68rem; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                      ${pickupFmt} ➔ ${returnFmt}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Fill trailing days for grid completion
    const totalCells = startDayIdx + lastDayOfMonth.getDate();
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
      html += `<div class="calendar-day-cell other-month">
        <div class="day-number">${day}</div>
      </div>`;
    }

    grid.innerHTML = html;
  },

  renderMatrixTimeline() {
    const container = document.getElementById('calendar-matrix-wrapper');
    if (!container) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    const cars = window.MocCarStore.getCars();
    const rentals = window.MocCarStore.getRentals();
    const today = new Date();

    let tableHtml = `
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="matrix-car-col">Đội Xe Máy / Ngày Trong Tuần</th>
    `;

    for (let d = 1; d <= lastDay; d++) {
      const dateObj = new Date(year, month, d);
      const dayOfWeekShort = this.getDayOfWeekShort(dateObj.getDay());
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
      const highlightStyle = isToday ? 'style="color: var(--primary); font-weight: 800;"' : '';
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      const weekendStyle = isWeekend ? 'style="color: var(--accent-gold);"' : '';

      tableHtml += `
        <th ${highlightStyle || weekendStyle}>
          <div>${d}</div>
          <div style="font-size:0.68rem; font-weight:normal; opacity:0.8;">${dayOfWeekShort}</div>
        </th>
      `;
    }

    tableHtml += `</tr></thead><tbody>`;

    if (cars.length === 0) {
      tableHtml += `
        <tr>
          <td colspan="${lastDay + 1}" style="text-align:center; padding: 2rem; color: var(--text-muted);">
            Chưa có xe máy trong hệ thống. Vui lòng bấm "+ Thêm Xe Máy Mới" ở mục Quản Lý Đội Xe.
          </td>
        </tr>
      `;
    } else {
      cars.forEach(car => {
        tableHtml += `
          <tr>
            <td class="matrix-car-col">
              <div style="font-weight:700;">${this.escapeHtml(car.name)}</div>
              <div style="font-size:0.75rem; color: var(--accent-gold);">${car.bks}</div>
            </td>
        `;

        for (let day = 1; day <= lastDay; day++) {
          const dateObj = new Date(year, month, day);
          const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayStart = new Date(year, month, day, 0, 0, 0);
          const dayEnd = new Date(year, month, day, 23, 59, 59);

          const activeRental = rentals.find(r => {
            if (r.carId !== car.id || r.status === 'Đã Hủy') return false;
            const pDate = new Date(r.pickupDate);
            const rDate = new Date(r.returnDate);
            return pDate <= dayEnd && rDate >= dayStart;
          });

          if (activeRental) {
            const statusClass = activeRental.status === 'Đang Thuê' ? 'active' : (activeRental.status === 'Đã Đặt' ? 'booked' : 'done');
            const pickupFmt = this.formatFullDateTimeWithDay(activeRental.pickupDate);
            const returnFmt = this.formatFullDateTimeWithDay(activeRental.returnDate);
            const phoneStr = activeRental.customerPhone ? ` (${activeRental.customerPhone})` : '';
            const tooltip = `${activeRental.status}: ${activeRental.customerName}${phoneStr}\nNhận: ${pickupFmt}\nTrả: ${returnFmt}`;

            tableHtml += `
              <td class="matrix-cell-day ${statusClass}" 
                  onclick="window.MocCarBooking.openQuickView('${activeRental.id}')"
                  title="${this.escapeHtml(tooltip)}">
                  <i class="fas fa-user-check" style="font-size: 0.75rem;"></i>
              </td>
            `;
          } else {
            tableHtml += `
              <td class="matrix-cell-day" 
                  onclick="window.MocCarCalendar.onQuickAdd('${cellDateStr}', '${car.id}')"
                  title="Lịch trống - Bấm để đặt xe máy ${car.name}">
              </td>
            `;
          }
        }

        tableHtml += `</tr>`;
      });
    }

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
  },

  onQuickAdd(dateStr, carId = null) {
    const pickupIso = `${dateStr}T08:00`;
    window.MocCarBooking.openModal(null, {
      carId: carId,
      pickupDate: pickupIso
    });
  },

  getPillStatusClass(status) {
    switch (status) {
      case 'Đã Đặt': return 'status-booked';
      case 'Đang Thuê': return 'status-active';
      case 'Đã Trả': return 'status-done';
      case 'Đã Hủy': return 'status-cancel';
      default: return 'status-booked';
    }
  },

  getDayOfWeekShort(dayIndex) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[dayIndex] || '';
  },

  formatShortDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${hours}:${mins} ${day}/${month}`;
  },

  formatFullDateTimeWithDay(isoStr) {
    if (!isoStr) return '---';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;

    const daysOfWeek = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = daysOfWeek[d.getDay()];

    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');

    return `${hours}:${mins} - ${dayName}, ${day}/${month}/${d.getFullYear()}`;
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
