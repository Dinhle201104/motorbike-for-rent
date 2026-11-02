/**
 * MOTORBIKE FOR RENT - DATA STORE & LOCAL STORAGE ENGINE
 * Manages Motorbikes Fleet, Rental Bookings, Cumulative Lifetime Revenue & Cash Received ledger.
 * Auto-heals legacy zero/null rental prices from localStorage.
 */

const STORAGE_KEY_CARS = 'moc_car_fleet_v2';
const STORAGE_KEY_RENTALS = 'moc_car_rentals_v2';

class Store {
  constructor() {
    this.cars = [];
    this.rentals = [];
    this.init();
  }

  init() {
    const storedCars = localStorage.getItem(STORAGE_KEY_CARS);
    const storedRentals = localStorage.getItem(STORAGE_KEY_RENTALS);

    if (storedCars) {
      try {
        this.cars = JSON.parse(storedCars);
      } catch (e) {
        this.cars = [];
      }
    } else {
      this.cars = [];
      this.saveCars();
    }

    if (storedRentals) {
      try {
        this.rentals = JSON.parse(storedRentals);
      } catch (e) {
        this.rentals = [];
      }
    } else {
      this.rentals = [];
      this.saveRentals();
    }

    // Auto-heal any corrupted or missing rental prices from legacy data
    this.repairCorruptedRentalPrices();
  }

  reloadFromStorage() {
    const storedCars = localStorage.getItem(STORAGE_KEY_CARS);
    const storedRentals = localStorage.getItem(STORAGE_KEY_RENTALS);
    if (storedCars) {
      try { this.cars = JSON.parse(storedCars); } catch (e) { this.cars = []; }
    }
    if (storedRentals) {
      try { this.rentals = JSON.parse(storedRentals); } catch (e) { this.rentals = []; }
    }
  }

  repairCorruptedRentalPrices() {
    let modified = false;
    (this.rentals || []).forEach(rent => {
      const price = Number(rent.rentalPrice);
      if (rent.isVehicleSwitchContinuation && price === 0) return;
      if (isNaN(price) || price <= 0) {
        const car = this.getCarById(rent.carId);
        const dailyRate = car ? (Number(car.dailyRate) || 800000) : 800000;
        
        let days = 1;
        if (rent.pickupDate && rent.returnDate) {
          const start = new Date(rent.pickupDate);
          const end = new Date(rent.returnDate);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
            const diffHours = (end - start) / (1000 * 60 * 60);
            days = Math.max(1, Math.ceil(diffHours / 24));
          }
        }
        rent.rentalPrice = dailyRate * days;
        modified = true;
      }
    });

    if (modified) {
      this.saveRentals();
    }
  }

  saveCars() {
    try {
      localStorage.setItem(STORAGE_KEY_CARS, JSON.stringify(this.cars));
      if (window.MocCarSync) window.MocCarSync.notifyLocalChange('save_cars');
    } catch (e) {
      console.warn('Lưu danh sách xe thất bại:', e);
    }
  }

  saveRentals() {
    try {
      localStorage.setItem(STORAGE_KEY_RENTALS, JSON.stringify(this.rentals));
      if (window.MocCarSync) window.MocCarSync.notifyLocalChange('save_rentals');
    } catch (e) {
      console.warn('Lưu đơn thuê thất bại:', e);
    }
  }

  // --- VEHICLE / FLEET METHODS ---
  getCars() {
    return this.cars || [];
  }

  getCarById(id) {
    if (!id) return null;
    return (this.cars || []).find(c => c.id === id) || null;
  }

  addCar(carData) {
    const newCar = {
      id: 'car-' + Date.now(),
      name: carData.name || 'Xe Máy Mới',
      bks: carData.bks || 'Chưa BKS',
      type: carData.type || 'Xe tay ga',
      dailyRate: Number(carData.dailyRate) || 150000,
      status: carData.status || 'Hoạt động'
    };
    this.cars.push(newCar);
    this.saveCars();
    return newCar;
  }

  updateCar(id, carData) {
    const idx = (this.cars || []).findIndex(c => c.id === id);
    if (idx !== -1) {
      this.cars[idx] = {
        ...this.cars[idx],
        ...carData,
        dailyRate: carData.dailyRate !== undefined ? (Number(carData.dailyRate) || 800000) : this.cars[idx].dailyRate
      };
      this.saveCars();
      return this.cars[idx];
    }
    return null;
  }

  deleteCar(id) {
    this.cars = (this.cars || []).filter(c => c.id !== id);
    this.saveCars();
  }

  // --- RENTAL BOOKING METHODS ---
  getRentals() {
    return this.rentals || [];
  }

  getRentalById(id) {
    if (!id) return null;
    return (this.rentals || []).find(r => r.id === id) || null;
  }

  getAvailableCarsForPeriod(startDate, endDate, excludeRentalId = null) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];

    return (this.cars || []).filter(car => {
      if (car.status !== 'Hoạt động') return false;
      return !(this.rentals || []).some(rental => {
        if (rental.carId !== car.id ||
            rental.id === excludeRentalId ||
            rental.status === 'Đã Hủy' ||
            rental.status === 'Đã Trả') return false;

        const rentalStart = new Date(rental.pickupDate);
        const rentalEnd = new Date(rental.returnDate);
        return !isNaN(rentalStart.getTime()) &&
          !isNaN(rentalEnd.getTime()) &&
          start < rentalEnd &&
          end > rentalStart;
      });
    });
  }

  switchRentalVehicle(id, newCarId, transitionAt) {
    const rental = this.getRentalById(id);
    if (!rental || rental.status !== 'Đang Thuê') {
      return { success: false, error: 'Chỉ có thể đổi xe cho đơn đang thuê.' };
    }

    const transitionTime = new Date(transitionAt);
    const originalReturnTime = new Date(rental.returnDate);
    const now = new Date();
    if (isNaN(transitionTime.getTime()) ||
        isNaN(originalReturnTime.getTime()) ||
        transitionTime.getTime() > now.getTime() ||
        originalReturnTime <= transitionTime) {
      return { success: false, error: 'Đơn thuê không còn thời gian tiếp tục để chuyển sang xe khác.' };
    }

    if (newCarId === rental.carId) {
      return { success: false, error: 'Vui lòng chọn xe khác với xe hiện tại.' };
    }

    const newCar = this.getCarById(newCarId);
    if (!newCar || !this.getAvailableCarsForPeriod(transitionAt, rental.returnDate, id)
      .some(car => car.id === newCarId)) {
      return { success: false, error: 'Xe được chọn không còn trống trong toàn bộ thời gian thuê còn lại.' };
    }

    const transitionLabel = new Date().toLocaleString('vi-VN');
    const closure = {
      ...rental,
      status: 'Đã Trả',
      returnDate: transitionAt,
      depositRefunded: 0,
      depositDeduction: 0,
      depositDeductionReason: '',
      idImages: [],
      completedAt: new Date().toISOString(),
      note: [
        rental.note,
        `Đã chuyển từ xe ${rental.carName} (${rental.bks}) lúc ${transitionLabel}.`,
        'Tiền cọc được chuyển tiếp, không hoàn tại thời điểm đổi xe.'
      ]
        .filter(Boolean)
        .join('\n')
    };
    let continuationId = `rent-${Date.now()}`;
    while ((this.rentals || []).some(item => item.id === continuationId)) {
      continuationId = `rent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const continuation = {
      ...rental,
      id: continuationId,
      carId: newCar.id,
      carName: newCar.name,
      bks: newCar.bks,
      rentalPrice: 0,
      pickupDate: transitionAt,
      status: 'Đang Thuê',
      isVehicleSwitchContinuation: true,
      completedAt: null,
      createdAt: new Date().toISOString(),
      note: [rental.note, `Tiếp tục đơn ${rental.id} trên xe ${newCar.name} (${newCar.bks}); không thu thêm phí.`]
        .filter(Boolean)
        .join('\n')
    };

    this.rentals = [continuation, ...this.rentals.map(item =>
      item.id === rental.id ? closure : item
    )];
    this.saveRentals();
    return { success: true, closedRental: closure, continuation };
  }

  addRental(rentalData) {
    const car = this.getCarById(rentalData.carId);
    const depositAmt = Number(rentalData.depositAmount) || 0;
    
    // Calculate fallback price if rentalPrice is 0
    let rentalPrice = Number(rentalData.rentalPrice) || 0;
    if (rentalPrice <= 0 && !rentalData.isVehicleSwitchContinuation) {
      const dailyRate = car ? (Number(car.dailyRate) || 800000) : 800000;
      rentalPrice = dailyRate;
    }

    const isDone = rentalData.status === 'Đã Trả';

    const newRental = {
      id: 'rent-' + Date.now(),
      carId: rentalData.carId || '',
      carName: car ? car.name : (rentalData.carName || 'Xe không tên'),
      bks: car ? car.bks : (rentalData.bks || '---'),
      rentalPrice: rentalPrice,
      pickupDate: rentalData.pickupDate || new Date().toISOString().slice(0, 16),
      returnDate: rentalData.returnDate || new Date().toISOString().slice(0, 16),
      customerName: rentalData.customerName || 'Khách vãng lai',
      customerPhone: rentalData.customerPhone || '',
      deliveryAddress: rentalData.deliveryAddress || '',
      customerCCCD: rentalData.customerCCCD || '',
      customerGPLX: rentalData.customerGPLX || '',
      idImages: Array.isArray(rentalData.idImages) ? rentalData.idImages : [],
      depositType: rentalData.depositType || 'Cọc tiền',
      depositAmount: depositAmt,
      depositDetail: rentalData.depositDetail || '',
      depositRefunded: isDone ? (rentalData.depositRefunded !== undefined ? (Number(rentalData.depositRefunded) || 0) : depositAmt) : 0,
      depositDeduction: isDone ? (Number(rentalData.depositDeduction) || 0) : 0,
      depositDeductionReason: rentalData.depositDeductionReason || '',
      customerSource: rentalData.customerSource || 'Khách vãng lai',
      status: rentalData.status || 'Đã Đặt',
      note: rentalData.note || '',
      isVehicleSwitchContinuation: rentalData.isVehicleSwitchContinuation === true,
      completedAt: isDone ? new Date().toISOString() : null,
      createdAt: new Date().toISOString()
    };
    this.rentals.unshift(newRental);
    this.saveRentals();
    return newRental;
  }

  updateRental(id, rentalData) {
    const idx = (this.rentals || []).findIndex(r => r.id === id);
    if (idx !== -1) {
      const current = this.rentals[idx];
      const targetCarId = rentalData.carId !== undefined ? rentalData.carId : current.carId;
      const car = this.getCarById(targetCarId);

      const isCompleting = (rentalData.status !== undefined ? rentalData.status : current.status) === 'Đã Trả';
      
      let rentalPrice = rentalData.rentalPrice !== undefined ? Number(rentalData.rentalPrice) : Number(current.rentalPrice);
      const isFreeContinuation = (rentalData.isVehicleSwitchContinuation === true ||
        (current.isVehicleSwitchContinuation && rentalData.isVehicleSwitchContinuation !== false)) &&
        rentalPrice === 0;
      if ((isNaN(rentalPrice) || rentalPrice <= 0) && !isFreeContinuation) {
        const dailyRate = car ? (Number(car.dailyRate) || 800000) : 800000;
        rentalPrice = dailyRate;
      }

      const initialDeposit = rentalData.depositAmount !== undefined ? (Number(rentalData.depositAmount) || 0) : (current.depositAmount || 0);

      const depositRefunded = isCompleting 
        ? (rentalData.depositRefunded !== undefined ? (Number(rentalData.depositRefunded) || 0) : (current.depositRefunded !== undefined ? current.depositRefunded : initialDeposit))
        : 0;

      const depositDeduction = isCompleting 
        ? (rentalData.depositDeduction !== undefined ? (Number(rentalData.depositDeduction) || 0) : (current.depositDeduction || 0))
        : 0;

      this.rentals[idx] = {
        ...current,
        ...rentalData,
        carName: car ? car.name : (rentalData.carName || current.carName || 'Xe không tên'),
        bks: car ? car.bks : (rentalData.bks || current.bks || '---'),
        rentalPrice: rentalPrice,
        depositAmount: initialDeposit,
        depositRefunded: depositRefunded,
        depositDeduction: depositDeduction,
        idImages: Array.isArray(rentalData.idImages) ? rentalData.idImages : (current.idImages || []),
        completedAt: isCompleting ? (current.completedAt || new Date().toISOString()) : null
      };

      this.saveRentals();
      return this.rentals[idx];
    }
    return null;
  }

  updateRentalStatus(id, newStatus, returnDetails = {}) {
    const rental = this.getRentalById(id);
    if (!rental) return null;

    const payload = {
      status: newStatus,
      ...returnDetails
    };

    if (newStatus === 'Đã Trả' && returnDetails.depositRefunded === undefined) {
      payload.depositRefunded = Number(rental.depositAmount) || 0;
      payload.depositDeduction = Number(rental.depositDeduction) || 0;
    }

    return this.updateRental(id, payload);
  }

  deleteRental(id) {
    const exists = (this.rentals || []).some(r => r.id === id);
    if (!exists) return false;

    this.rentals = (this.rentals || []).filter(r => r.id !== id);
    this.saveRentals();
    return true;
  }

  // --- STATS & LIFETIME REVENUE CALCULATIONS ---
  getDashboardStats() {
    let cumulativeRealizedRevenue = 0; // Total net revenue collected from completed returns
    let pendingRevenue = 0;            // Expected revenue from active & booked rentals
    let totalAllRentalValue = 0;       // Total base rental price of all bookings
    let totalDepositsRefunded = 0;     // Total deposit money returned to customers
    let totalDeductionsKept = 0;       // Total deductions / extra fees kept
    let currentDepositsHeld = 0;       // Deposit money currently held for active/booked rentals
    let activeRentalsCount = 0;
    let completedRentalsCount = 0;

    const monthlyRealizedRevenue = new Array(12).fill(0);
    const monthlyTotalRevenue = new Array(12).fill(0);

    const returnHistory = [];

    const sourceStats = {
      'Facebook': 0,
      'Khách quen': 0,
      'Giới thiệu': 0,
      'TikTok': 0,
      'Khách vãng lai': 0,
      'Khác': 0
    };

    const carStatsMap = {};
    (this.cars || []).forEach(car => {
      carStatsMap[car.id] = {
        carId: car.id,
        carName: car.name,
        bks: car.bks,
        rentalCount: 0,
        completedCount: 0,
        realizedRevenue: 0,
        totalRevenue: 0
      };
    });

    (this.rentals || []).forEach(rent => {
      if (rent && rent.status !== 'Đã Hủy') {
        const price = Number(rent.rentalPrice) || 0;
        const depositAmt = Number(rent.depositAmount) || 0;
        const deduction = Number(rent.depositDeduction) || 0;
        const refunded = Number(rent.depositRefunded) || 0;

        totalAllRentalValue += price;

        const dateStr = rent.completedAt || rent.returnDate || rent.pickupDate || rent.createdAt;
        const refDate = dateStr ? new Date(dateStr) : null;

        if (refDate && !isNaN(refDate.getTime())) {
          const m = refDate.getMonth();
          if (m >= 0 && m < 12) {
            monthlyTotalRevenue[m] += price;
          }
        }

        if (rent.status === 'Đã Trả') {
          const netBookingRevenue = price + deduction;

          cumulativeRealizedRevenue += netBookingRevenue;
          totalDepositsRefunded += refunded;
          totalDeductionsKept += deduction;
          completedRentalsCount++;

          if (refDate && !isNaN(refDate.getTime())) {
            const m = refDate.getMonth();
            if (m >= 0 && m < 12) {
              monthlyRealizedRevenue[m] += netBookingRevenue;
            }
          }

          returnHistory.push({
            id: rent.id,
            customerName: rent.customerName || 'Khách vãng lai',
            customerPhone: rent.customerPhone || '',
            carName: rent.carName || 'Xe không tên',
            bks: rent.bks || '---',
            completedAt: rent.completedAt || rent.returnDate || new Date().toISOString(),
            rentalPrice: price,
            depositAmount: depositAmt,
            depositRefunded: refunded,
            depositDeduction: deduction,
            depositDeductionReason: rent.depositDeductionReason || '',
            netCollected: netBookingRevenue
          });
        } else {
          pendingRevenue += price;
        }

        if (rent.status === 'Đang Thuê' || rent.status === 'Đã Đặt') {
          currentDepositsHeld += depositAmt;
        }

        if (rent.status === 'Đang Thuê') {
          activeRentalsCount++;
        }

        const src = rent.customerSource || 'Khác';
        if (sourceStats[src] !== undefined) {
          sourceStats[src]++;
        } else {
          sourceStats['Khác']++;
        }

        if (carStatsMap[rent.carId]) {
          carStatsMap[rent.carId].rentalCount++;
          if (rent.status === 'Đã Trả') {
            carStatsMap[rent.carId].completedCount++;
            carStatsMap[rent.carId].realizedRevenue += (price + deduction);
          }
          carStatsMap[rent.carId].totalRevenue += price;
        }
      }
    });

    returnHistory.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    // TỔNG SỐ TIỀN ĐÃ NHẬN ĐƯỢC THỰC TẾ = Doanh thu thực thu từ các đơn đã trả xe + Tiền cọc đang giữ của các đơn active
    const totalCashReceived = cumulativeRealizedRevenue + currentDepositsHeld;

    // TỔNG DOANH THU TOÀN BỘ LỊCH SỬ THUÊ XE = Cumulative Realized + Pending Revenue
    const totalLifetimeRevenue = cumulativeRealizedRevenue + pendingRevenue;

    return {
      totalCashReceived,          // TỔNG TIỀN ĐÃ NHẬN ĐƯỢC
      totalLifetimeRevenue,      // TỔNG DOANH THU LỊCH SỬ
      cumulativeRealizedRevenue, // DOANH THU ĐÃ TRẢ XE
      pendingRevenue,            // DOANH THU DỰ KIẾN
      totalAllRentalValue,       // TỔNG GIÁ TRỊ THUÊ XE GỐC
      totalRevenue: totalLifetimeRevenue,
      totalDepositsRefunded,
      totalDeductionsKept,
      currentDepositsHeld,
      activeRentalsCount,
      completedRentalsCount,
      totalFleetCount: (this.cars || []).length,
      monthlyRealizedRevenue,
      monthlyTotalRevenue,
      sourceStats,
      carPerformance: Object.values(carStatsMap),
      returnHistory
    };
  }

  exportDataJSON() {
    const data = {
      cars: this.cars,
      rentals: this.rentals,
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  }

  importDataJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed.cars) && Array.isArray(parsed.rentals)) {
        this.cars = parsed.cars;
        this.rentals = parsed.rentals;
        this.saveCars();
        this.saveRentals();
        this.repairCorruptedRentalPrices();
        return true;
      }
    } catch (e) {
      console.error('Import failed:', e);
    }
    return false;
  }

  clearAllData() {
    this.cars = [];
    this.rentals = [];
    this.saveCars();
    this.saveRentals();
  }

  resetDefaultData() {
    this.clearAllData();
  }
}

window.MocCarStore = new Store();
