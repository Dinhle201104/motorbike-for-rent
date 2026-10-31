/**
 * MOTORBIKE FOR RENT - DASHBOARD & REVENUE REPORTING MODULE
 * Renders Total Cash Received, Cumulative Lifetime Revenue, 12-Month Bar Chart, and Return History Ledger.
 */

window.MocCarReports = {
  chartSource: null,
  chartPerformance: null,
  chartMonthly: null,

  init() {
    // Registered in app initialization
  },

  renderDashboard() {
    const stats = window.MocCarStore.getDashboardStats();

    // 1. Update Top KPI Cards
    const elCashReceived = document.getElementById('kpi-total-cash-received');
    const elLifetime = document.getElementById('kpi-total-lifetime-revenue');
    const elRealized = document.getElementById('kpi-realized-revenue');
    const elTotalAll = document.getElementById('kpi-total-all-rental-value');
    const elRefunded = document.getElementById('kpi-total-refunded');
    const elPending = document.getElementById('kpi-pending-revenue');
    const elDeposit = document.getElementById('kpi-total-deposit');
    const elCompletedCount = document.getElementById('kpi-completed-count');
    const elDeductions = document.getElementById('kpi-total-deductions');
    const elFleet = document.getElementById('kpi-fleet-count');

    if (elCashReceived) elCashReceived.textContent = this.formatMoney(stats.totalCashReceived);
    if (elLifetime) elLifetime.textContent = this.formatMoney(stats.totalLifetimeRevenue);
    if (elRealized) elRealized.textContent = this.formatMoney(stats.cumulativeRealizedRevenue);
    if (elTotalAll) elTotalAll.textContent = this.formatMoney(stats.totalAllRentalValue);
    if (elRefunded) elRefunded.textContent = this.formatMoney(stats.totalDepositsRefunded);
    if (elPending) elPending.textContent = this.formatMoney(stats.pendingRevenue);
    if (elDeposit) elDeposit.textContent = this.formatMoney(stats.currentDepositsHeld);
    if (elCompletedCount) elCompletedCount.textContent = `Đã hoàn thành ${stats.completedRentalsCount} lượt trả xe`;
    if (elDeductions) elDeductions.textContent = `Phụ thu / Trừ cọc: ${this.formatMoney(stats.totalDeductionsKept)}`;
    if (elFleet) elFleet.textContent = `Quy mô: ${stats.totalFleetCount} xe (${stats.activeRentalsCount} xe đang cho thuê)`;

    // 2. Render 12-Month Revenue Comparison Bar Chart
    this.renderMonthlyChart(stats.monthlyRealizedRevenue, stats.monthlyTotalRevenue);

    // 3. Render Return Transaction History Ledger Table
    this.renderReturnHistoryTable(stats.returnHistory);

    // 4. Render Customer Source Chart (Donut Chart)
    this.renderSourceChart(stats.sourceStats);

    // 5. Render Vehicle Performance Chart (Horizontal Bar Chart)
    this.renderPerformanceChart(stats.carPerformance);

    // 6. Render Vehicle Performance Table Summary
    this.renderPerformanceTable(stats.carPerformance);
  },

  renderMonthlyChart(monthlyRealized, monthlyTotal) {
    const canvas = document.getElementById('chart-monthly-revenue');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chartMonthly) {
      this.chartMonthly.destroy();
    }

    const labels = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];

    this.chartMonthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Doanh Thu CỘNG DỒN THỰC THU (Đã Trả Xe)',
            data: monthlyRealized,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Tổng Doanh Thu Hợp Đồng (Gồm Active/Đặt)',
            data: monthlyTotal,
            backgroundColor: 'rgba(59, 130, 246, 0.45)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#f8fafc', font: { family: 'Plus Jakarta Sans', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const labelName = context.dataset.label;
                const revFmt = this.formatMoney(context.raw);
                return ` ${labelName}: ${revFmt}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              callback: (val) => (val >= 1000000 ? (val / 1000000) + ' Tr' : val)
            }
          }
        }
      }
    });
  },

  renderReturnHistoryTable(historyList) {
    const tbody = document.getElementById('table-return-history-tbody');
    if (!tbody) return;

    if (!historyList || historyList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Chưa có giao dịch trả xe nào. Khi khách trả xe và hoàn cọc, lịch sử cộng dồn doanh thu sẽ tự động hiển thị ở đây.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = historyList.map(item => {
      const dateFmt = this.formatDateTimeWithDayOfWeek(item.completedAt);
      const deductionTxt = item.depositDeduction > 0 
        ? `<span style="color:var(--accent-gold); font-weight:600;">+ ${this.formatMoney(item.depositDeduction)}</span>${item.depositDeductionReason ? `<div style="font-size:0.72rem; color:var(--text-dim);">${this.escapeHtml(item.depositDeductionReason)}</div>` : ''}`
        : `<span style="color:var(--text-dim);">0 ₫</span>`;

      return `
        <tr>
          <td style="font-size:0.82rem;">${dateFmt}</td>
          <td>
            <div style="font-weight:700;">${this.escapeHtml(item.customerName)}</div>
            ${item.customerPhone ? `<div style="font-size:0.78rem; color:var(--text-muted);">${item.customerPhone}</div>` : ''}
          </td>
          <td>
            <span class="plate-badge">${item.bks}</span>
            <span style="font-size:0.88rem; margin-left:4px;">${this.escapeHtml(item.carName)}</span>
          </td>
          <td style="font-weight:700; color:var(--accent-gold);">
            ${this.formatMoney(item.rentalPrice)}
          </td>
          <td style="color:var(--primary); font-weight:600;">
            ${item.depositType === 'Cọc giấy tờ' || item.depositType === 'Cọc xe' ? `
              <span style="font-size:0.8rem; color:var(--accent-gold);"><i class="fas fa-id-card"></i> Trả giấy tờ</span>
            ` : (item.depositType === 'Không cọc' || item.depositType === 'Không cọc gì cả') ? `
              <span style="color:var(--text-dim);">-</span>
            ` : `
              <i class="fas fa-undo"></i> ${this.formatMoney(item.depositRefunded)}
            `}
          </td>
          <td>${deductionTxt}</td>
          <td style="text-align:right; font-weight:800; color:var(--primary); font-size:0.95rem;">
            + ${this.formatMoney(item.netCollected)}
          </td>
        </tr>
      `;
    }).join('');
  },

  renderSourceChart(sourceStats) {
    const canvas = document.getElementById('chart-customer-source');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chartSource) {
      this.chartSource.destroy();
    }

    const labels = Object.keys(sourceStats);
    const data = Object.values(sourceStats);

    const colors = [
      '#10b981', // Emerald - Facebook
      '#f59e0b', // Gold - Khách quen
      '#3b82f6', // Blue - Giới thiệu
      '#ec4899', // Pink - TikTok
      '#8b5cf6', // Purple - Khách vãng lai
      '#64748b'  // Slate - Khác
    ];

    this.chartSource = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#1e293b',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#f8fafc',
              font: { family: 'Plus Jakarta Sans', size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const val = context.raw || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return ` ${context.label}: ${val} đơn (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  renderPerformanceChart(carPerfList) {
    const canvas = document.getElementById('chart-car-performance');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.chartPerformance) {
      this.chartPerformance.destroy();
    }

    const sorted = [...carPerfList].sort((a, b) => b.realizedRevenue - a.realizedRevenue);

    const labels = sorted.map(c => `${c.carName} (${c.bks})`);
    const realizedRevenues = sorted.map(c => c.realizedRevenue);

    this.chartPerformance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Doanh Thu CỘNG DỒN LŨY KẾ (Đã Trả Xe)',
            data: realizedRevenues,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const revFmt = this.formatMoney(context.raw);
                return ` Doanh thu cộng dồn: ${revFmt}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              callback: (val) => (val >= 1000000 ? (val / 1000000) + ' Tr' : val)
            }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#f8fafc', font: { weight: '600' } }
          }
        }
      }
    });
  },

  renderPerformanceTable(carPerfList) {
    const tbody = document.getElementById('table-fleet-perf-tbody');
    if (!tbody) return;

    const sorted = [...carPerfList].sort((a, b) => b.realizedRevenue - a.realizedRevenue);

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có dữ liệu xe. Hãy thêm xe mới vào hệ thống.</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map((car, idx) => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.1); display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; color:var(--accent-gold);">${idx + 1}</span>
            <div>
              <strong>${this.escapeHtml(car.carName)}</strong>
              <div style="font-size:0.75rem; color:var(--text-dim);">${car.bks}</div>
            </div>
          </div>
        </td>
        <td style="text-align:center;">
          <span class="badge badge-done">${car.completedCount || 0} lượt trả</span>
        </td>
        <td style="text-align:center; font-weight:600;">
          ${car.rentalCount || 0} đơn
        </td>
        <td style="text-align:right; font-weight:700; color:var(--primary);">
          ${this.formatMoney(car.realizedRevenue)}
        </td>
        <td style="text-align:right; font-weight:600; color:var(--accent-blue);">
          ${this.formatMoney(car.totalRevenue)}
        </td>
      </tr>
    `).join('');
  },

  formatMoney(amount) {
    const val = Number(amount);
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(isNaN(val) ? 0 : val);
  },

  formatDateTimeWithDayOfWeek(isoStr) {
    if (!isoStr) return '---';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;

    const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayName = daysOfWeek[d.getDay()];

    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${hours}:${mins} (${dayName}), ${day}/${month}/${year}`;
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
