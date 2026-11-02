/**
 * MOTORBIKE FOR RENT - BOOKING FORM & RENTAL MANAGEMENT MODULE
 * Handles form creation, editing, +24h auto-date calculations, document image uploads, return settlement modal, and deposit refunds.
 */

window.MocCarBooking = {
  currentEditingId: null,
  currentUploadedImages: [],
  currentSwitchRentalId: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const pickupInput = document.getElementById('booking-pickup');
    const returnInput = document.getElementById('booking-return');
    const carSelect = document.getElementById('booking-car-id');
    const depositTypeSelect = document.getElementById('booking-deposit-type');

    if (carSelect) {
      carSelect.addEventListener('change', (e) => {
        this.onCarSelected(e.target.value);
        this.validateAndCheckConflict();
      });
    }

    if (pickupInput) {
      pickupInput.addEventListener('change', () => {
        this.onPickupDateChanged();
        this.validateAndCheckConflict();
      });
    }

    if (returnInput) {
      returnInput.addEventListener('change', () => {
        this.calculateTotalEstimate();
        this.validateAndCheckConflict();
      });
    }

    const statusSelect = document.getElementById('booking-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this.validateAndCheckConflict());
    }

    if (depositTypeSelect) {
      depositTypeSelect.addEventListener('change', (e) => this.toggleDepositFields(e.target.value));
    }

    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
      bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveBooking();
      });
    }

    // Settlement Return Form Event
    const settlementForm = document.getElementById('settlement-form');
    if (settlementForm) {
      settlementForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitReturnSettlement();
      });

      const inputDeduction = document.getElementById('settlement-deduction-amount');
      if (inputDeduction) {
        inputDeduction.addEventListener('input', () => this.updateSettlementNetTotal());
      }
    }

    const switchVehicleForm = document.getElementById('switch-vehicle-form');
    if (switchVehicleForm) {
      switchVehicleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitVehicleSwitch();
      });
    }
  },

  formatLocalISO(date) {
    if (!date || isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  },

  setPickupDateToCurrentTime(value) {
    const selectedDate = new Date(value);
    if (isNaN(selectedDate.getTime())) return value;

    const now = new Date();
    selectedDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return this.formatLocalISO(selectedDate);
  },

  populateCarDropdown() {
    const carSelect = document.getElementById('booking-car-id');
    if (!carSelect) return;

    const cars = window.MocCarStore.getCars();
    carSelect.innerHTML = '<option value="">-- Chọn xe cho thuê --</option>';

    if (cars.length === 0) {
      carSelect.innerHTML = '<option value="">-- Chưa có xe trong hệ thống (Hãy thêm xe trước) --</option>';
      return;
    }

    const rentals = window.MocCarStore.getRentals();
    const now = new Date();

    cars.forEach(car => {
      // Kiểm tra xem xe này hiện có đang được thuê không
      const activeRental = rentals.find(r => r.carId === car.id && r.status === 'Đang Thuê');
      let statusTag = '';
      if (activeRental) {
        const retDate = new Date(activeRental.returnDate);
        const diffMs = retDate.getTime() - now.getTime();
        if (diffMs > 0) {
          const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
          statusTag = ` ⚠️ [Đang có người thuê - còn ~${totalHours}h]`;
        } else {
          statusTag = ` ⚠️ [Đang có người thuê - quá hạn trả]`;
        }
      }

      const opt = document.createElement('option');
      opt.value = car.id;
      opt.textContent = `${car.name} (${car.bks})${statusTag} - ${this.formatMoney(car.dailyRate)}/ngày`;
      carSelect.appendChild(opt);
    });
  },

  onCarSelected(carId) {
    if (!carId) return;
    const car = window.MocCarStore.getCarById(carId);
    if (!car) return;

    const priceInput = document.getElementById('booking-rental-price');
    if (priceInput) priceInput.value = window.MocCarUtils.formatMoneyInput(car.dailyRate);
    this.calculateTotalEstimate();
  },

  onPickupDateChanged() {
    const pickupInput = document.getElementById('booking-pickup');
    const returnInput = document.getElementById('booking-return');

    if (!pickupInput.value) return;
    if (!this.currentEditingId) {
      pickupInput.value = this.setPickupDateToCurrentTime(pickupInput.value);
    }

    const pickupTime = new Date(pickupInput.value);
    if (isNaN(pickupTime.getTime())) return;

    const returnTime = new Date(pickupTime.getTime() + 24 * 60 * 60 * 1000);
    returnInput.value = this.formatLocalISO(returnTime);

    this.calculateTotalEstimate();
  },

  addHoursToReturn(hours) {
    const pickupInput = document.getElementById('booking-pickup');
    const returnInput = document.getElementById('booking-return');

    const baseTime = pickupInput.value ? new Date(pickupInput.value) : new Date();
    if (isNaN(baseTime.getTime())) return;

    const newReturn = new Date(baseTime.getTime() + hours * 60 * 60 * 1000);
    returnInput.value = this.formatLocalISO(newReturn);

    this.calculateTotalEstimate();
    this.validateAndCheckConflict();
  },

  calculateTotalEstimate() {
    const pickupInput = document.getElementById('booking-pickup');
    const returnInput = document.getElementById('booking-return');
    const durationBadge = document.getElementById('booking-duration-badge');

    if (!pickupInput.value || !returnInput.value) return;

    const start = new Date(pickupInput.value);
    const end = new Date(returnInput.value);

    if (end <= start) {
      if (durationBadge) durationBadge.textContent = 'Thời gian trả xe phải sau thời gian nhận!';
      return;
    }

    const diffHours = (end - start) / (1000 * 60 * 60);
    const daysFloat = diffHours / 24;
    const daysDisplay = Math.max(1, Math.round(daysFloat * 10) / 10);

    if (durationBadge) {
      durationBadge.textContent = `Tổng thời gian thuê: ${daysDisplay} ngày (${Math.round(diffHours)} giờ)`;
    }
  },

  isConfirmingPickup(rentalId, carId, pickupDate, returnDate, status) {
    if (!rentalId || status !== 'Đang Thuê') return false;

    const rental = window.MocCarStore.getRentalById(rentalId);
    const sameDateTime = (first, second) => {
      const firstTime = new Date(first).getTime();
      const secondTime = new Date(second).getTime();
      return !isNaN(firstTime) && firstTime === secondTime;
    };

    return !!rental &&
      rental.status === 'Đã Đặt' &&
      rental.carId === carId &&
      sameDateTime(rental.pickupDate, pickupDate) &&
      sameDateTime(rental.returnDate, returnDate);
  },

  toggleDepositFields(depositType) {
    const amountGroup = document.getElementById('deposit-amount-group');
    const detailGroup = document.getElementById('deposit-detail-group');
    const amountInput = document.getElementById('booking-deposit-amount');
    const detailInput = document.getElementById('booking-deposit-detail');

    if (depositType === 'Cọc tiền') {
      if (amountGroup) amountGroup.style.display = 'block';
      if (detailGroup) detailGroup.style.display = 'none';
      if (detailInput) detailInput.value = '';
    } else if (depositType === 'Cọc giấy tờ' || depositType === 'Cọc xe') {
      if (amountGroup) amountGroup.style.display = 'none';
      if (detailGroup) detailGroup.style.display = 'block';
      if (amountInput) amountInput.value = '0';
    } else { // 'Không cọc' or 'Không cọc gì cả'
      if (amountGroup) amountGroup.style.display = 'none';
      if (detailGroup) detailGroup.style.display = 'none';
      if (amountInput) amountInput.value = '0';
      if (detailInput) detailInput.value = '';
    }
  },

  toggleDepositDetailField(depositType) {
    this.toggleDepositFields(depositType);
  },

  // --- VEHICLE SCHEDULE CONFLICT & ACTIVE RENTAL CHECKER ---
  checkVehicleConflict(carId, pickupDateStr, returnDateStr, excludeRentalId = null) {
    if (!carId || !pickupDateStr || !returnDateStr) return null;

    const newStart = new Date(pickupDateStr);
    const newEnd = new Date(returnDateStr);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) return null;

    const rentals = window.MocCarStore.getRentals();
    const now = new Date();

    // Lọc các đơn đang hoạt động (không bị hủy hoặc đã trả) của xe này
    const candidates = rentals.filter(r => {
      if (r.carId !== carId) return false;
      if (excludeRentalId && r.id === excludeRentalId) return false;
      if (r.status === 'Đã Hủy' || r.status === 'Đã Trả') return false;
      return true;
    });

    const conflicting = [];

    candidates.forEach(r => {
      const existStart = new Date(r.pickupDate);
      const existEnd = new Date(r.returnDate);
      if (isNaN(existStart.getTime()) || isNaN(existEnd.getTime())) return;

      const isOngoing = (r.status === 'Đang Thuê');

      // 1. Trùng lịch trực tiếp (giao thoa giữa 2 khoảng thời gian: A < D && B > C)
      const isOverlap = (newStart < existEnd && newEnd > existStart);

      // 2. Xe đang có người thuê và thời điểm nhận xe mới diễn ra trước khi xe được trả
      const isCurrentlyRentedConflict = isOngoing && (newStart < existEnd);

      // 3. Xe đang có người thuê nhưng đã quá hạn trả mà chưa hoàn tất trả xe
      const isOverdueConflict = isOngoing && (now >= existEnd) && (newStart <= now);

      if (isOverlap || isCurrentlyRentedConflict || isOverdueConflict) {
        conflicting.push({
          rental: r,
          existStart,
          existEnd,
          isOngoing,
          isOverdue: isOngoing && (now >= existEnd)
        });
      }
    });

    if (conflicting.length === 0) return null;

    // Ưu tiên đơn đang thuê trước, sau đó tới đơn có thời gian trả sớm nhất
    conflicting.sort((a, b) => {
      if (a.isOngoing && !b.isOngoing) return -1;
      if (!a.isOngoing && b.isOngoing) return 1;
      return a.existEnd - b.existEnd;
    });

    const primary = conflicting[0];
    const r = primary.rental;
    const existEnd = primary.existEnd;
    const diffMs = existEnd.getTime() - now.getTime();

    // Tính chính xác số giờ và phút còn lại đến thời điểm trả xe
    let timeRemainingStr = '';
    let totalHours = 0;
    let isOverdue = false;

    if (diffMs > 0) {
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const d = Math.floor(totalMinutes / (60 * 24));
      const h = Math.floor((totalMinutes % (60 * 24)) / 60);
      const m = totalMinutes % 60;
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;

      let parts = [];
      if (d > 0) parts.push(`${d} ngày`);
      if (h > 0 || d > 0) parts.push(`${h} giờ`);
      parts.push(`${m} phút`);
      timeRemainingStr = `${parts.join(' ')} (khoảng ${totalHours} giờ)`;
    } else {
      isOverdue = true;
      const overdueMs = Math.abs(diffMs);
      const totalMinutes = Math.floor(overdueMs / (1000 * 60));
      const d = Math.floor(totalMinutes / (60 * 24));
      const h = Math.floor((totalMinutes % (60 * 24)) / 60);
      const m = totalMinutes % 60;
      totalHours = Math.round((overdueMs / (1000 * 60 * 60)) * 10) / 10;

      let parts = [];
      if (d > 0) parts.push(`${d} ngày`);
      if (h > 0 || d > 0) parts.push(`${h} giờ`);
      parts.push(`${m} phút`);
      timeRemainingStr = `Đã quá hạn trả ${parts.join(' ')} (quá ${totalHours} giờ)`;
    }

    const returnFmt = this.formatDateTimeWithDayOfWeek(r.returnDate);
    const pickupFmt = this.formatDateTimeWithDayOfWeek(r.pickupDate);
    const car = window.MocCarStore.getCarById(carId);

    return {
      conflicts: conflicting,
      primaryConflict: primary,
      carName: car ? car.name : (r.carName || 'Xe máy'),
      bks: car ? car.bks : (r.bks || ''),
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      status: r.status,
      returnDate: r.returnDate,
      returnFmt,
      pickupFmt,
      timeRemainingStr,
      totalHours,
      isOverdue,
      isOngoing: primary.isOngoing
    };
  },

  renderConflictAlert(conflict) {
    const alertBox = document.getElementById('booking-conflict-alert');
    if (!alertBox) return;

    if (!conflict) {
      alertBox.style.display = 'none';
      alertBox.innerHTML = '';
      return;
    }

    const titleText = conflict.isOngoing
      ? (conflict.isOverdue
          ? 'CẢNH BÁO: XE ĐANG CÓ NGƯỜI THUÊ (ĐÃ QUÁ HẠN TRẢ XE)'
          : 'CẢNH BÁO: XE ĐANG CÓ NGƯỜI THUÊ CHƯA ĐẾN GIỜ TRẢ')
      : 'CẢNH BÁO: TRÙNG LỊCH VỚI ĐƠN ĐÃ ĐẶT TRƯỚC';

    const timeLabel = conflict.isOverdue
      ? 'Thời gian quá hạn trả xe:'
      : 'Số giờ còn lại đến khi xe được trả:';

    alertBox.style.display = 'block';
    alertBox.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.12); border: 2px solid #ef4444; border-radius: var(--radius-md); padding: 0.9rem 1rem; color: #f8fafc; margin-top: 0.35rem; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.2);">
        <div style="display: flex; align-items: center; gap: 0.5rem; color: #f87171; font-weight: 800; font-size: 0.95rem; margin-bottom: 0.5rem;">
          <i class="fas fa-exclamation-triangle" style="font-size: 1.2rem; color: #f87171;"></i>
          <span>${titleText}</span>
        </div>
        
        <div style="background: rgba(15, 23, 42, 0.65); border-left: 4px solid #f59e0b; padding: 0.6rem 0.85rem; border-radius: 4px; margin: 0.5rem 0;">
          <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${timeLabel}</div>
          <div style="font-size: 1.25rem; font-weight: 800; color: #fbbf24; margin: 3px 0;">
            <i class="fas fa-hourglass-half"></i> ${conflict.timeRemainingStr}
          </div>
          <div style="font-size: 0.85rem; color: #cbd5e1;">
            Dự kiến trả xe lúc: <strong style="color: #38bdf8;">${conflict.returnFmt}</strong>
          </div>
        </div>

        <div style="font-size: 0.83rem; color: #cbd5e1; line-height: 1.6; margin-top: 0.4rem;">
          <div><i class="fas fa-user-clock"></i> Khách đang giữ/đặt xe: <strong style="color:#f8fafc;">${this.escapeHtml(conflict.customerName)}</strong> ${conflict.customerPhone ? `(${this.escapeHtml(conflict.customerPhone)})` : ''} - Trạng thái: <span class="badge ${this.getStatusBadgeClass(conflict.status)}">${conflict.status}</span></div>
          <div><i class="fas fa-calendar-alt"></i> Khung giờ trùng: <strong>${conflict.pickupFmt}</strong> ➔ <strong>${conflict.returnFmt}</strong></div>
        </div>

        <div style="margin-top: 0.6rem; padding-top: 0.5rem; border-top: 1px dashed rgba(239, 68, 68, 0.4); font-size: 0.82rem; color: #fca5a5; font-weight: 600;">
          <i class="fas fa-ban"></i> Vui lòng chọn xe máy khác hoặc dời thời gian nhận xe sau <strong>${conflict.returnFmt}</strong>!
        </div>
      </div>
    `;
  },

  validateAndCheckConflict() {
    const carId = document.getElementById('booking-car-id')?.value;
    const pickupDate = document.getElementById('booking-pickup')?.value;
    const returnDate = document.getElementById('booking-return')?.value;
    const status = document.getElementById('booking-status')?.value;

    if (!carId || !pickupDate || !returnDate) {
      this.renderConflictAlert(null);
      return null;
    }

    if (this.isConfirmingPickup(this.currentEditingId, carId, pickupDate, returnDate, status)) {
      this.renderConflictAlert(null);
      return null;
    }

    const conflict = this.checkVehicleConflict(carId, pickupDate, returnDate, this.currentEditingId);
    this.renderConflictAlert(conflict);
    return conflict;
  },

  // DOCUMENT IMAGE UPLOAD & CANVAS COMPRESSION HANDLER
  handleImageUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawBase64 = e.target.result;
        this.compressImage(rawBase64, (compressedBase64) => {
          this.currentUploadedImages.push(compressedBase64);
          this.renderImagePreviews();
        });
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  },

  compressImage(base64Str, callback) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const maxDim = 1000;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
      callback(compressedBase64);
    };
    img.onerror = () => callback(base64Str);
    img.src = base64Str;
  },

  removeImage(index) {
    this.currentUploadedImages.splice(index, 1);
    this.renderImagePreviews();
  },

  renderImagePreviews() {
    const container = document.getElementById('booking-id-images-preview');
    if (!container) return;

    if (this.currentUploadedImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this.currentUploadedImages.map((imgSrc, idx) => `
      <div style="position: relative; width: 75px; height: 75px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-color);">
        <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window.MocCarBooking.openLightbox('${imgSrc}')" title="Bấm để xem ảnh phóng to">
        <button type="button" onclick="window.MocCarBooking.removeImage(${idx})" style="position: absolute; top: 2px; right: 2px; background: rgba(239,68,68,0.85); color: #fff; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">&times;</button>
      </div>
    `).join('');
  },

  openLightbox(imgSrc) {
    const lightbox = document.getElementById('modal-image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img-src');
    if (lightbox && lightboxImg) {
      lightboxImg.src = imgSrc;
      lightbox.classList.add('active');
    }
  },

  openModal(rentalId = null, prefillData = null) {
    this.populateCarDropdown();
    this.currentEditingId = rentalId;
    this.currentUploadedImages = [];

    const modal = document.getElementById('modal-booking');
    const title = document.getElementById('modal-booking-title');
    const form = document.getElementById('booking-form');

    form.reset();

    if (rentalId) {
      title.innerHTML = '<i class="fas fa-edit"></i> Chỉnh Sửa Đơn Cho Thuê';
      const rental = window.MocCarStore.getRentalById(rentalId);
      if (rental) {
        document.getElementById('booking-car-id').value = rental.carId;
        document.getElementById('booking-pickup').value = rental.pickupDate;
        document.getElementById('booking-return').value = rental.returnDate;
        document.getElementById('booking-rental-price').value = window.MocCarUtils.formatMoneyInput(rental.rentalPrice);
        document.getElementById('booking-customer-name').value = rental.customerName;
        if (document.getElementById('booking-customer-phone')) {
          document.getElementById('booking-customer-phone').value = rental.customerPhone || '';
        }
        if (document.getElementById('booking-delivery-address')) {
          document.getElementById('booking-delivery-address').value = rental.deliveryAddress || '';
        }
        let depType = rental.depositType || 'Cọc tiền';
        if (depType === 'Cọc xe') depType = 'Cọc giấy tờ';
        document.getElementById('booking-deposit-type').value = depType;
        document.getElementById('booking-deposit-amount').value = window.MocCarUtils.formatMoneyInput(rental.depositAmount || 0);
        document.getElementById('booking-deposit-detail').value = rental.depositDetail || '';
        document.getElementById('booking-customer-source').value = rental.customerSource || 'Khách vãng lai';
        document.getElementById('booking-status').value = rental.status || 'Đã Đặt';
        document.getElementById('booking-note').value = rental.note || '';

        this.currentUploadedImages = rental.idImages ? [...rental.idImages] : [];
        this.renderImagePreviews();

        this.toggleDepositFields(depType);
        this.calculateTotalEstimate();
      }
    } else {
      title.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo Đơn Cho Thuê Mới';

      const now = new Date();
      document.getElementById('booking-pickup').value = this.formatLocalISO(now);
      document.getElementById('booking-status').value = 'Đang Thuê';

      this.onPickupDateChanged();
      this.renderImagePreviews();

      document.getElementById('booking-deposit-type').value = 'Cọc tiền';
      document.getElementById('booking-deposit-amount').value = '';
      document.getElementById('booking-deposit-detail').value = '';
      this.toggleDepositFields('Cọc tiền');

      if (prefillData) {
        if (prefillData.carId) document.getElementById('booking-car-id').value = prefillData.carId;
        if (prefillData.pickupDate) document.getElementById('booking-pickup').value = prefillData.pickupDate;
        if (prefillData.pickupDate && !prefillData.returnDate) this.onPickupDateChanged();
        if (prefillData.returnDate) document.getElementById('booking-return').value = prefillData.returnDate;
        this.onCarSelected(prefillData.carId);
      }
    }

    if (window.MocCarUtils) window.MocCarUtils.attachCurrencyFormatters();
    this.validateAndCheckConflict();
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('modal-booking');
    if (modal) modal.classList.remove('active');
    this.currentEditingId = null;
    this.currentUploadedImages = [];
    this.renderConflictAlert(null);
  },

  saveBooking() {
    const carId = document.getElementById('booking-car-id').value;
    const pickupDate = document.getElementById('booking-pickup').value;
    const returnDate = document.getElementById('booking-return').value;
    const rentalPrice = window.MocCarUtils.parseMoney(document.getElementById('booking-rental-price').value);
    const customerName = document.getElementById('booking-customer-name').value.trim();
    const customerPhone = document.getElementById('booking-customer-phone') ? document.getElementById('booking-customer-phone').value.trim() : '';
    const deliveryAddressEl = document.getElementById('booking-delivery-address');
    const deliveryAddress = deliveryAddressEl ? deliveryAddressEl.value.trim() : '';
    const status = document.getElementById('booking-status').value;

    if (!carId) {
      window.MocCarApp.showToast('Vui lòng chọn xe cho thuê! Hãy thêm xe mới nếu danh sách trống.', 'warning');
      return;
    }

    if (!customerName || !pickupDate || !returnDate) {
      window.MocCarApp.showToast('Bắt buộc nhập Họ tên và Thời gian nhận/trả xe!', 'warning');
      return;
    }

    const pickupTime = new Date(pickupDate);
    const returnTime = new Date(returnDate);
    if (isNaN(pickupTime.getTime()) || isNaN(returnTime.getTime()) || returnTime <= pickupTime) {
      window.MocCarApp.showToast('Thời gian trả xe phải sau thời gian nhận xe!', 'warning');
      return;
    }

    if (!this.currentEditingId && pickupTime.getHours() !== new Date().getHours()) {
      const currentHour = String(new Date().getHours()).padStart(2, '0');
      window.MocCarApp.showToast(`Giờ nhận xe phải trùng với giờ hiện tại (${currentHour} giờ). Vui lòng chỉnh lại giờ nhận xe.`, 'warning');
      return;
    }

    // KIỂM TRA TRÙNG LỊCH HOẶC XE ĐANG CÓ NGƯỜI THUÊ
    if (status !== 'Đã Hủy' && status !== 'Đã Trả' &&
        !this.isConfirmingPickup(this.currentEditingId, carId, pickupDate, returnDate, status)) {
      const conflict = this.checkVehicleConflict(carId, pickupDate, returnDate, this.currentEditingId);
      if (conflict) {
        this.renderConflictAlert(conflict);

        const toastMsg = conflict.isOngoing
          ? (conflict.isOverdue
              ? `Xe ${conflict.carName} (${conflict.bks}) đang có người thuê và đã quá hạn trả xe! Vui lòng quyết toán đơn trước.`
              : `Xe ${conflict.carName} (${conflict.bks}) đang có người thuê! Còn lại ${conflict.timeRemainingStr} nữa mới đến giờ trả xe (${conflict.returnFmt}). Vui lòng chọn xe khác!`)
          : `Xe ${conflict.carName} (${conflict.bks}) bị TRÙNG LỊCH với đơn đã đặt! Còn lại ${conflict.timeRemainingStr} nữa xe mới được trả (${conflict.returnFmt}). Vui lòng chọn xe khác!`;

        window.MocCarApp.showToast(toastMsg, 'warning', 7000);

        const alertBox = document.getElementById('booking-conflict-alert');
        if (alertBox) {
          alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
    }

    const depositType = document.getElementById('booking-deposit-type').value;
    let depositAmount = 0;
    let depositDetail = '';

    if (depositType === 'Cọc tiền') {
      depositAmount = window.MocCarUtils.parseMoney(document.getElementById('booking-deposit-amount').value);
      depositDetail = '';
    } else if (depositType === 'Cọc giấy tờ' || depositType === 'Cọc xe') {
      depositAmount = 0;
      depositDetail = document.getElementById('booking-deposit-detail') ? document.getElementById('booking-deposit-detail').value.trim() : '';
    } else { // Không cọc
      depositAmount = 0;
      depositDetail = '';
    }

    const payload = {
      carId,
      pickupDate,
      returnDate,
      rentalPrice: rentalPrice,
      customerName,
      customerPhone,
      deliveryAddress,
      idImages: this.currentUploadedImages,
      depositType,
      depositAmount,
      depositDetail,
      customerSource: document.getElementById('booking-customer-source').value,
      status: status,
      note: document.getElementById('booking-note').value.trim()
    };

    const editingId = this.currentEditingId;
    let savedRental;
    if (editingId) {
      savedRental = window.MocCarStore.updateRental(editingId, payload);
      if (!savedRental) {
        window.MocCarApp.showToast('Không tìm thấy đơn thuê để cập nhật. Vui lòng tải lại danh sách và thử lại.', 'danger');
        return;
      }
      window.MocCarApp.showToast('Đã cập nhật đơn thuê xe thành công!', 'success');
    } else {
      savedRental = window.MocCarStore.addRental(payload);
      window.MocCarApp.showToast('Tạo đơn cho thuê xe mới thành công!', 'success');
    }

    this.closeModal();
    window.MocCarApp.refreshAllViews();

    // If marked as 'Đã Trả' directly, trigger settlement popup to confirm deposit refunding!
    if (status === 'Đã Trả' && savedRental) {
      this.openReturnSettlementModal(savedRental.id);
    }
  },

  // RETURN SETTLEMENT & DEPOSIT REFUND MODAL
  openReturnSettlementModal(rentalId) {
    const rental = window.MocCarStore.getRentalById(rentalId);
    if (!rental) return;

    const modal = document.getElementById('modal-return-settlement');
    const summaryCard = document.getElementById('settlement-summary-card');
    const inputId = document.getElementById('settlement-rental-id');
    const inputRefund = document.getElementById('settlement-refund-amount');
    const inputDeduction = document.getElementById('settlement-deduction-amount');
    const inputReason = document.getElementById('settlement-deduction-reason');

    if (!modal) return;

    inputId.value = rental.id;
    const initialDeposit = rental.depositAmount || 0;

    let depositSummaryHtml = '';
    if (rental.depositType === 'Cọc giấy tờ' || rental.depositType === 'Cọc xe') {
      depositSummaryHtml = `
        <div style="font-size:0.85rem; color:var(--accent-gold); margin-top:3px;">
          <i class="fas fa-id-card"></i> Hình thức cọc: <strong>Cọc giấy tờ</strong>
          ${rental.depositDetail ? ` - Tên giấy tờ: <strong style="color:var(--text-main);">${this.escapeHtml(rental.depositDetail)}</strong>` : ''}
          <div style="color:var(--primary); font-size:0.8rem; margin-top:2px;"><i class="fas fa-info-circle"></i> Lưu ý: Hoàn trả lại giấy tờ cho khách khi xong đơn.</div>
        </div>
      `;
    } else if (rental.depositType === 'Không cọc' || rental.depositType === 'Không cọc gì cả') {
      depositSummaryHtml = `
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:3px; font-style:italic;">
          Hình thức cọc: Không cọc
        </div>
      `;
    } else {
      depositSummaryHtml = `
        <div style="font-size:0.85rem; color:var(--accent-gold); margin-top:2px;">
          <i class="fas fa-money-bill-wave"></i> Hình thức cọc: <strong>Cọc tiền</strong> - Đã nhận cọc: <strong>${this.formatMoney(initialDeposit)}</strong>
        </div>
      `;
    }

    summaryCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="plate-badge">${rental.bks}</span>
          <strong style="margin-left:6px; font-size:1.05rem;">${this.escapeHtml(rental.carName)}</strong>
        </div>
        <div style="font-weight:700; color:var(--primary); font-size:1.1rem;">${this.formatMoney(rental.rentalPrice)}</div>
      </div>
      <div style="margin-top:0.4rem; font-size:0.85rem; color:var(--text-muted);">
        Khách hàng: <strong style="color:var(--text-main);">${this.escapeHtml(rental.customerName)}</strong>${rental.customerPhone ? ` (${this.escapeHtml(rental.customerPhone)})` : ''}
      </div>
      ${depositSummaryHtml}
    `;

    if (rental.depositType === 'Cọc giấy tờ' || rental.depositType === 'Cọc xe' || rental.depositType === 'Không cọc' || rental.depositType === 'Không cọc gì cả') {
      inputRefund.value = '0';
    } else {
      inputRefund.value = window.MocCarUtils.formatMoneyInput(rental.depositRefunded !== undefined ? rental.depositRefunded : initialDeposit);
    }
    inputDeduction.value = window.MocCarUtils.formatMoneyInput(rental.depositDeduction || 0);
    inputReason.value = rental.depositDeductionReason || '';

    this.updateSettlementNetTotal();
    modal.classList.add('active');
  },

  updateSettlementNetTotal() {
    const inputId = document.getElementById('settlement-rental-id').value;
    const rental = window.MocCarStore.getRentalById(inputId);
    const deduction = window.MocCarUtils.parseMoney(document.getElementById('settlement-deduction-amount').value);
    const displayTotal = document.getElementById('settlement-net-total');

    if (rental && displayTotal) {
      const netTotal = (rental.rentalPrice || 0) + deduction;
      displayTotal.textContent = this.formatMoney(netTotal);
    }
  },

  submitReturnSettlement() {
    const rentalId = document.getElementById('settlement-rental-id').value;
    const depositRefunded = window.MocCarUtils.parseMoney(document.getElementById('settlement-refund-amount').value);
    const depositDeduction = window.MocCarUtils.parseMoney(document.getElementById('settlement-deduction-amount').value);
    const depositDeductionReason = document.getElementById('settlement-deduction-reason').value.trim();

    window.MocCarStore.updateRentalStatus(rentalId, 'Đã Trả', {
      depositRefunded,
      depositDeduction,
      depositDeductionReason
    });

    window.MocCarApp.showToast('Đã hoàn tất trả xe, hoàn cọc và CỘNG DỒN DOANH THU!', 'success');
    document.getElementById('modal-return-settlement')?.classList.remove('active');
    document.getElementById('modal-quick-view')?.classList.remove('active');
    window.MocCarApp.refreshAllViews();
  },

  renderRentalTable() {
    const container = document.getElementById('booking-table-tbody');
    if (!container) return;

    const rentals = window.MocCarStore.getRentals();
    const carFilter = document.getElementById('filter-car')?.value || '';
    const statusFilter = document.getElementById('filter-status')?.value || '';
    const searchKeyword = document.getElementById('filter-search')?.value.toLowerCase() || '';

    const filtered = rentals.filter(rent => {
      const matchCar = !carFilter || rent.carId === carFilter;
      const matchStatus = !statusFilter || rent.status === statusFilter;
      const matchSearch = !searchKeyword ||
        (rent.customerName && rent.customerName.toLowerCase().includes(searchKeyword)) ||
        (rent.customerPhone && rent.customerPhone.toLowerCase().includes(searchKeyword)) ||
        (rent.depositDetail && rent.depositDetail.toLowerCase().includes(searchKeyword)) ||
        (rent.deliveryAddress && rent.deliveryAddress.toLowerCase().includes(searchKeyword)) ||
        (rent.carName && rent.carName.toLowerCase().includes(searchKeyword)) ||
        (rent.bks && rent.bks.toLowerCase().includes(searchKeyword));
      return matchCar && matchStatus && matchSearch;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            <i class="fas fa-inbox fa-2x" style="margin-bottom: 0.5rem; display: block; opacity:0.5;"></i>
            Chưa có đơn cho thuê nào. Bấm nút "+ Tạo Đơn Thuê Nhanh" để tạo đơn mới.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = filtered.map(rent => {
      const pickupFmt = this.formatDateTimeWithDayOfWeek(rent.pickupDate);
      const returnFmt = this.formatDateTimeWithDayOfWeek(rent.returnDate);
      const badgeClass = this.getStatusBadgeClass(rent.status);
      const hasImages = rent.idImages && rent.idImages.length > 0;
      const isDone = rent.status === 'Đã Trả';
      const netCollected = rent.rentalPrice + (rent.depositDeduction || 0);

      return `
        <tr>
          <td>
            <div class="customer-cell">
              <span class="customer-name">${this.escapeHtml(rent.customerName)}</span>
              ${rent.customerPhone ? `<span class="customer-sub"><i class="fas fa-phone-alt"></i> ${this.escapeHtml(rent.customerPhone)}</span>` : '<span class="customer-sub" style="color:var(--text-dim);"><i class="fas fa-phone-slash"></i> Không có SĐT</span>'}
              ${rent.deliveryAddress ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;"><i class="fas fa-map-marker-alt" style="color:var(--primary);"></i> ${this.escapeHtml(rent.deliveryAddress)}</div>` : ''}
              ${hasImages ? `<div style="font-size:0.72rem; color:var(--primary); margin-top:2px;"><i class="fas fa-paperclip"></i> ${rent.idImages.length} ảnh đính kèm</div>` : ''}
            </div>
          </td>
          <td>
            <div class="car-cell">
              <span class="plate-badge">${rent.bks}</span>
              <span>${this.escapeHtml(rent.carName)}</span>
            </div>
          </td>
          <td>
            <div style="font-size: 0.82rem; line-height:1.4;">
              <div><strong style="color:var(--primary);">Nhận:</strong> ${pickupFmt}</div>
              <div><strong style="color:var(--status-cancel-text);">Trả:</strong> ${returnFmt}</div>
            </div>
          </td>
          <td>
            <div style="font-weight: 700; color: var(--primary);">
              ${this.formatMoney(rent.rentalPrice)}
            </div>
            ${isDone && rent.depositDeduction > 0 ? `<div style="font-size:0.73rem; color:var(--accent-gold);">+ ${this.formatMoney(rent.depositDeduction)} phụ thu</div>` : ''}
            ${isDone ? `<div style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-top:2px;">Thực thu: ${this.formatMoney(netCollected)}</div>` : ''}
          </td>
          <td>
            <div style="font-size: 0.85rem;">
              ${rent.depositType === 'Cọc giấy tờ' || rent.depositType === 'Cọc xe' ? `
                <span style="color: var(--accent-gold); font-weight: 600;"><i class="fas fa-id-card"></i> Cọc giấy tờ:</span> 
                <div><strong>${this.escapeHtml(rent.depositDetail || 'Giấy tờ tùy thân')}</strong></div>
                ${isDone ? `
                  <div style="font-size:0.75rem; color:var(--primary); margin-top:2px;">
                    <i class="fas fa-check-circle"></i> Đã hoàn trả giấy tờ
                  </div>
                ` : ''}
              ` : (rent.depositType === 'Không cọc' || rent.depositType === 'Không cọc gì cả') ? `
                <span style="color: var(--text-muted); font-style: italic;"><i class="fas fa-ban"></i> Không cọc</span>
              ` : `
                <span style="color: var(--accent-gold); font-weight: 600;"><i class="fas fa-money-bill-wave"></i> Cọc tiền:</span> 
                ${this.formatMoney(rent.depositAmount)}
                ${isDone ? `
                  <div style="font-size:0.75rem; color:var(--primary); margin-top:2px;">
                    <i class="fas fa-undo"></i> Đã hoàn cọc: <strong>${this.formatMoney(rent.depositRefunded)}</strong>
                  </div>
                ` : ''}
              `}
            </div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${rent.status}</span>
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
              <i class="fas fa-bullhorn"></i> ${rent.customerSource || 'Vãng lai'}
            </div>
          </td>
          <td>
            <div class="filter-group">
              <button class="btn btn-secondary btn-sm" onclick="window.MocCarBooking.openQuickView('${rent.id}')" title="Xem chi tiết & ảnh giấy tờ">
                <i class="fas fa-eye"></i>
              </button>

              ${!isDone ? `
                <button class="btn btn-primary btn-sm" onclick="window.MocCarBooking.openReturnSettlementModal('${rent.id}')" title="Xác nhận trả xe & quyết toán cọc">
                  <i class="fas fa-check-circle"></i> Trả Xe
                </button>
              ` : ''}

              <button class="btn btn-secondary btn-sm" onclick="window.MocCarBooking.openModal('${rent.id}')" title="Sửa đơn">
                <i class="fas fa-edit"></i>
              </button>

              <button class="btn btn-danger btn-sm" onclick="window.MocCarBooking.deleteBooking('${rent.id}')" title="Xóa đơn">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openQuickView(rentalId) {
    const rent = window.MocCarStore.getRentalById(rentalId);
    if (!rent) return;

    const modal = document.getElementById('modal-quick-view');
    const body = document.getElementById('quick-view-body');

    const pickupFmt = this.formatDateTimeWithDayOfWeek(rent.pickupDate);
    const returnFmt = this.formatDateTimeWithDayOfWeek(rent.returnDate);
    const hasImages = rent.idImages && rent.idImages.length > 0;
    const isDone = rent.status === 'Đã Trả';
    const netCollected = rent.rentalPrice + (rent.depositDeduction || 0);

    let imagesHtml = '';
    if (hasImages) {
      imagesHtml = `
        <div class="glass-card" style="padding: 1rem;">
          <h4 style="color: var(--primary); font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase;"><i class="fas fa-images"></i> Ảnh Giấy Tờ Đính Kèm (${rent.idImages.length} ảnh)</h4>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${rent.idImages.map(imgSrc => `
              <img src="${imgSrc}" style="width: 85px; height: 85px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-color); cursor: pointer;" onclick="window.MocCarBooking.openLightbox('${imgSrc}')" title="Bấm để xem phóng to">
            `).join('')}
          </div>
        </div>
      `;
    }

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div>
            <span class="plate-badge" style="font-size: 1.1rem; padding: 4px 10px;">${rent.bks}</span>
            <h3 style="margin-top: 0.4rem; font-weight: 800;">${this.escapeHtml(rent.carName)}</h3>
          </div>
          <div>
            <span class="badge ${this.getStatusBadgeClass(rent.status)}" style="font-size: 0.9rem; padding: 6px 14px;">${rent.status}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="glass-card" style="padding: 1rem;">
            <h4 style="color: var(--primary); font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase;"><i class="fas fa-user"></i> Khách Hàng</h4>
            <div style="font-weight: 700; font-size: 1.1rem;">${this.escapeHtml(rent.customerName)}</div>
            ${rent.customerPhone ? `<div style="margin-top: 0.3rem;"><i class="fas fa-phone"></i> <a href="tel:${rent.customerPhone}" style="color: var(--accent-blue); text-decoration: none; font-weight:700;">${this.escapeHtml(rent.customerPhone)}</a></div>` : '<div style="margin-top:0.3rem; color:var(--text-dim); font-size:0.85rem;"><i class="fas fa-phone-slash"></i> Không có số điện thoại</div>'}
            ${rent.deliveryAddress ? `<div style="margin-top: 0.3rem; font-size: 0.85rem; color: var(--text-muted);"><i class="fas fa-map-marker-alt" style="color: var(--primary);"></i> Giao xe tại: <strong style="color: var(--text-main);">${this.escapeHtml(rent.deliveryAddress)}</strong></div>` : ''}
          </div>

          <div class="glass-card" style="padding: 1rem;">
            <h4 style="color: var(--accent-gold); font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase;"><i class="fas fa-wallet"></i> Quyết Toán Tiền Thuê & Cọc</h4>
            <div>Giá thuê xe: <strong style="color: var(--primary); font-size: 1.1rem;">${this.formatMoney(rent.rentalPrice)}</strong></div>
            ${rent.depositType === 'Cọc giấy tờ' || rent.depositType === 'Cọc xe' ? `
              <div style="margin-top: 0.3rem;"><i class="fas fa-id-card" style="color:var(--accent-gold);"></i> Hình thức cọc: <strong>Cọc giấy tờ</strong></div>
              <div>Tên giấy tờ cọc: <strong style="color:var(--text-main);">${this.escapeHtml(rent.depositDetail || 'Giấy tờ tùy thân')}</strong></div>
              ${isDone ? `<div style="margin-top: 0.3rem; color: var(--primary);"><i class="fas fa-check-circle"></i> Đã hoàn trả lại giấy tờ cho khách</div>` : ''}
            ` : (rent.depositType === 'Không cọc' || rent.depositType === 'Không cọc gì cả') ? `
              <div style="margin-top: 0.3rem;"><i class="fas fa-ban" style="color:var(--text-muted);"></i> Hình thức cọc: <strong style="color:var(--text-muted); font-style:italic;">Không cọc</strong></div>
            ` : `
              <div style="margin-top: 0.3rem;"><i class="fas fa-money-bill-wave" style="color:var(--accent-gold);"></i> Tiền cọc ban đầu: <strong>${this.formatMoney(rent.depositAmount)}</strong> (Cọc tiền)</div>
              ${isDone ? `<div style="margin-top: 0.3rem; color: var(--primary);"><i class="fas fa-undo"></i> Đã hoàn cọc: <strong>${this.formatMoney(rent.depositRefunded)}</strong></div>` : ''}
            `}
            ${isDone && rent.depositDeduction > 0 ? `<div style="color: var(--accent-gold);">Phụ thu/Khấu trừ: <strong>+ ${this.formatMoney(rent.depositDeduction)}</strong> (${this.escapeHtml(rent.depositDeductionReason)})</div>` : ''}
            ${isDone ? `<div style="border-top: 1px solid var(--border-color); margin-top: 6px; padding-top: 4px; font-weight: 800; color: var(--primary);">Cộng dồn doanh thu: ${this.formatMoney(netCollected)}</div>` : ''}
          </div>
        </div>

        <div class="glass-card" style="padding: 1rem;">
          <h4 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase;"><i class="fas fa-clock"></i> Thời Gian Nhận & Trả Xe</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div><i class="fas fa-calendar-check" style="color: var(--primary);"></i> <strong>Nhận xe:</strong><br><span style="color:var(--text-main); font-weight:600;">${pickupFmt}</span></div>
            <div><i class="fas fa-calendar-minus" style="color: var(--status-cancel-text);"></i> <strong>Trả xe:</strong><br><span style="color:var(--text-main); font-weight:600;">${returnFmt}</span></div>
          </div>
        </div>

        ${imagesHtml}

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
          ${rent.status === 'Đang Thuê' ? `
            <button class="btn btn-secondary" onclick="window.MocCarBooking.openVehicleSwitchModal('${rent.id}')">
              <i class="fas fa-exchange-alt"></i> Đổi Xe
            </button>
          ` : ''}
          ${!isDone ? `
            <button class="btn btn-primary" onclick="window.MocCarBooking.openReturnSettlementModal('${rent.id}')">
              <i class="fas fa-hand-holding-usd"></i> Xác Nhận Trả Xe & Quyết Toán Cọc
            </button>
          ` : `
            <span class="badge badge-done" style="padding: 8px 14px; font-size: 0.85rem;"><i class="fas fa-check-double"></i> Đã hoàn thành trả xe & cộng dồn doanh thu</span>
          `}
          <button class="btn btn-secondary" onclick="window.MocCarBooking.openModal('${rent.id}'); document.getElementById('modal-quick-view').classList.remove('active');">
            <i class="fas fa-edit"></i> Chỉnh Sửa
          </button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  },

  openVehicleSwitchModal(rentalId) {
    const rental = window.MocCarStore.getRentalById(rentalId);
    const modal = document.getElementById('modal-switch-vehicle');
    const select = document.getElementById('switch-vehicle-car-id');
    const details = document.getElementById('switch-vehicle-details');
    if (!rental || rental.status !== 'Đang Thuê' || !modal || !select || !details) {
      window.MocCarApp.showToast('Chỉ có thể đổi xe cho đơn đang thuê.', 'warning');
      return;
    }

    const transitionAt = this.formatLocalISO(new Date());
    const availableCars = window.MocCarStore.getAvailableCarsForPeriod(
      transitionAt,
      rental.returnDate,
      rental.id
    ).filter(car => car.id !== rental.carId);

    if (availableCars.length === 0) {
      window.MocCarApp.showToast('Không có xe trống trong toàn bộ thời gian thuê còn lại.', 'warning');
      return;
    }

    this.currentSwitchRentalId = rental.id;
    select.innerHTML = '<option value="">-- Chọn xe thay thế --</option>' +
      availableCars.map(car =>
        `<option value="${this.escapeHtml(car.id)}">${this.escapeHtml(car.name)} (${this.escapeHtml(car.bks)})</option>`
      ).join('');
    details.innerHTML = `
      Xe hiện tại: <strong>${this.escapeHtml(rental.carName)} (${this.escapeHtml(rental.bks)})</strong><br>
      Thời gian thuê còn lại đến <strong>${this.formatDateTimeWithDayOfWeek(rental.returnDate)}</strong>.<br>
      Khi xác nhận, xe hiện tại được ghi nhận trả ngay; xe mới tiếp tục đơn đến giờ trả cũ. Không thu thêm tiền, tiền cọc được giữ cho đơn tiếp nối.
    `;
    modal.classList.add('active');
  },

  submitVehicleSwitch() {
    const select = document.getElementById('switch-vehicle-car-id');
    if (!this.currentSwitchRentalId || !select || !select.value) {
      window.MocCarApp.showToast('Vui lòng chọn xe thay thế.', 'warning');
      return;
    }

    const transitionAt = this.formatLocalISO(new Date());
    const result = window.MocCarStore.switchRentalVehicle(
      this.currentSwitchRentalId,
      select.value,
      transitionAt
    );
    if (!result.success) {
      window.MocCarApp.showToast(result.error, 'warning');
      return;
    }

    document.getElementById('modal-switch-vehicle').classList.remove('active');
    document.getElementById('modal-quick-view')?.classList.remove('active');
    this.currentSwitchRentalId = null;
    window.MocCarApp.refreshAllViews();
    window.MocCarApp.showToast('Đã trả xe cũ và chuyển thời gian thuê còn lại sang xe mới, không thu thêm phí.', 'success');
  },

  deleteBooking(id) {
    if (confirm('Bạn có chắc chắn muốn xóa đơn cho thuê xe này?')) {
      const deleted = window.MocCarStore.deleteRental(id);
      if (!deleted) {
        window.MocCarApp.showToast('Không tìm thấy đơn thuê để xóa. Vui lòng tải lại danh sách và thử lại.', 'danger');
        return;
      }
      window.MocCarApp.showToast('Đã xóa đơn thuê thành công', 'info');
      window.MocCarApp.refreshAllViews();
    }
  },

  getStatusBadgeClass(status) {
    switch (status) {
      case 'Đã Đặt': return 'badge-booked';
      case 'Đang Thuê': return 'badge-active';
      case 'Đã Trả': return 'badge-done';
      case 'Đã Hủy': return 'badge-cancel';
      default: return 'badge-booked';
    }
  },

  formatMoney(amount) {
    const val = Number(amount);
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(isNaN(val) ? 0 : val);
  },

  formatDateTimeWithDayOfWeek(isoStr) {
    if (!isoStr) return '---';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;

    const daysOfWeek = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = daysOfWeek[d.getDay()];

    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${hours}:${mins} - ${dayName}, ${day}/${month}/${year}`;
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
