/**
 * MOTORBIKE FOR RENT - FLEET MANAGEMENT MODULE
 * Handles CRUD operations for fleet vehicles & daily rental pricing.
 */

window.MocCarFleet = {
  editingCarId: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const carForm = document.getElementById('car-form');
    if (carForm) {
      carForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCar();
      });
    }
  },

  renderFleetGrid() {
    const container = document.getElementById('fleet-grid-container');
    if (!container) return;

    const cars = window.MocCarStore.getCars();

    if (cars.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fas fa-motorcycle fa-3x" style="margin-bottom: 1rem; display: block;"></i>
          Chưa có xe máy nào trong đội xe. Hãy bấm nút "Thêm Xe Máy Mới" để tạo xe.
        </div>
      `;
      return;
    }

    container.innerHTML = cars.map(car => `
      <div class="car-card">
        <div>
          <div class="car-card-header">
            <div>
              <span class="plate-badge">${car.bks}</span>
              <div class="car-card-title" style="margin-top: 0.4rem;">${this.escapeHtml(car.name)}</div>
            </div>
            <span class="badge ${car.status === 'Hoạt động' ? 'badge-done' : 'badge-cancel'}">${car.status}</span>
          </div>

          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            <i class="fas fa-motorcycle"></i> Phân loại: ${this.escapeHtml(car.type)}
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.85rem; margin-top: 0.85rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Giá thuê mặc định:</div>
              <div class="car-card-rate">${this.formatMoney(car.dailyRate)}/ngày</div>
            </div>

            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.MocCarFleet.openModal('${car.id}')" title="Sửa thông tin xe máy">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.MocCarFleet.deleteCar('${car.id}')" title="Xóa xe máy">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  },

  openModal(carId = null) {
    this.editingCarId = carId;
    const modal = document.getElementById('modal-car');
    const title = document.getElementById('modal-car-title');
    const form = document.getElementById('car-form');

    form.reset();

    if (carId) {
      title.innerHTML = '<i class="fas fa-motorcycle"></i> Chỉnh Sửa Thông Tin Xe Máy';
      const car = window.MocCarStore.getCarById(carId);
      if (car) {
        document.getElementById('car-name').value = car.name;
        document.getElementById('car-bks').value = car.bks;
        document.getElementById('car-type').value = car.type;
        document.getElementById('car-daily-rate').value = window.MocCarUtils.formatMoneyInput(car.dailyRate);
        document.getElementById('car-status').value = car.status;
      }
    } else {
      title.innerHTML = '<i class="fas fa-plus-circle"></i> Thêm Xe Máy Mới Vào Đội Xe';
    }

    if (window.MocCarUtils) window.MocCarUtils.attachCurrencyFormatters();
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('modal-car');
    if (modal) modal.classList.remove('active');
    this.editingCarId = null;
  },

  saveCar() {
    const name = document.getElementById('car-name').value.trim();
    const bks = document.getElementById('car-bks').value.trim();
    const type = document.getElementById('car-type').value.trim();
    const dailyRate = window.MocCarUtils.parseMoney(document.getElementById('car-daily-rate').value);
    const status = document.getElementById('car-status').value;

    if (!name || !bks || !dailyRate) {
      window.MocCarApp.showToast('Vui lòng điền Tên xe, BKS và Giá thuê!', 'warning');
      return;
    }

    const payload = {
      name,
      bks,
      type: type || 'Xe tay ga',
      dailyRate: dailyRate,
      status
    };

    if (this.editingCarId) {
      window.MocCarStore.updateCar(this.editingCarId, payload);
      window.MocCarApp.showToast('Đã cập nhật thông tin xe máy!', 'success');
    } else {
      window.MocCarStore.addCar(payload);
      window.MocCarApp.showToast('Đã thêm xe máy mới thành công!', 'success');
    }

    this.closeModal();
    window.MocCarApp.refreshAllViews();
  },

  deleteCar(id) {
    if (confirm('Bạn có chắc chắn muốn xóa xe máy này khỏi đội xe? Các đơn thuê liên quan sẽ không bị xóa.')) {
      window.MocCarStore.deleteCar(id);
      window.MocCarApp.showToast('Đã xóa xe máy khỏi danh sách', 'info');
      window.MocCarApp.refreshAllViews();
    }
  },

  formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
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
