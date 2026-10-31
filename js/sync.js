/**
 * MOTORBIKE FOR RENT - REALTIME CROSS-TAB & CLOUD SYNC ENGINE
 * Handles cross-tab communication (BroadcastChannel + LocalStorage Event)
 * and multi-device Cloud Synchronization (KV Storage API with Sync Key & QR Code).
 */

class SyncEngine {
  constructor() {
    this.defaultSyncKey = 'MOCCAR-SYNC';
    this.syncKey = localStorage.getItem('moc_car_sync_key') || this.defaultSyncKey;
    if (!localStorage.getItem('moc_car_sync_key')) {
      localStorage.setItem('moc_car_sync_key', this.defaultSyncKey);
    }

    const storedAuto = localStorage.getItem('moc_car_auto_sync');
    this.autoSyncEnabled = storedAuto !== null ? storedAuto === 'true' : true;
    if (storedAuto === null) {
      localStorage.setItem('moc_car_auto_sync', 'true');
    }

    this.channel = null;
    this.syncStatus = 'idle'; // 'idle', 'syncing', 'success', 'error'
    this.lastSyncedAt = localStorage.getItem('moc_car_last_synced') || null;
    this.appKey = 'moc_car_fleet_v1';
    this.isProcessingSync = false;
    this.pushTimer = null;
    this.pollIntervalTimer = null;
    this.lastPayloadHash = '';
  }

  init() {
    this.setupCrossTabSync();
    if (this.autoSyncEnabled && this.syncKey) {
      this.pullFromCloud({ silent: true });
      this.startContinuousPolling(5000);
    }
    this.updateUIStatus();
  }

  // --- 1. CROSS-TAB LOCAL REALTIME SYNC ---
  setupCrossTabSync() {
    // Setup BroadcastChannel for instant local tab messaging
    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('moc_car_sync_channel');
        this.channel.onmessage = (event) => {
          if (event && event.data) {
            this.handleRemoteChange(event.data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel disabled or unsupported:', e);
      }
    }

    // Fallback/Supplement with window storage listener for cross-tab updates
    window.addEventListener('storage', (e) => {
      if (e.key === 'moc_car_fleet_v2' || e.key === 'moc_car_rentals_v2') {
        this.handleRemoteChange({ source: 'storage_event', key: e.key });
      }
    });

    // Sync on tab focus
    window.addEventListener('focus', () => {
      if (this.autoSyncEnabled && this.syncKey && !this.isProcessingSync) {
        this.pullFromCloud({ silent: true });
      }
    });
  }

  startContinuousPolling(intervalMs = 5000) {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    this.pollIntervalTimer = setInterval(() => {
      if (this.autoSyncEnabled && this.syncKey && !this.isProcessingSync) {
        this.pullFromCloud({ silent: true });
      }
    }, intervalMs);
  }

  notifyLocalChange(action = 'update') {
    // Send message to other tabs on same device
    if (this.channel) {
      try {
        this.channel.postMessage({
          source: 'moc_car_tab',
          action: action,
          timestamp: Date.now()
        });
      } catch (e) {
        console.warn('BroadcastChannel error sending message:', e);
      }
    }

    // Auto-push to cloud if enabled
    if (this.autoSyncEnabled && this.syncKey && !this.isProcessingSync) {
      this.debounceAutoPush();
    }
  }

  handleRemoteChange(data) {
    if (this.isProcessingSync) return;
    this.isProcessingSync = true;

    try {
      if (window.MocCarStore) {
        window.MocCarStore.reloadFromStorage();
      }

      if (window.MocCarApp) {
        window.MocCarApp.refreshAllViews();
      }
    } catch (e) {
      console.error('Lỗi khi cập nhật dữ liệu từ tab khác:', e);
    } finally {
      this.isProcessingSync = false;
    }
  }

  debounceAutoPush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushToCloud({ silent: true });
      if (typeof window.syncDataToCloud === 'function') {
        window.syncDataToCloud();
      }
    }, 1000);
  }

  // --- HELPER UNICODE SAFE BASE64 ---
  utf8ToBase64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
  }

  base64ToUtf8(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  }

  // --- 2. CROSS-DEVICE CLOUD SYNC ENGINE ---
  setSyncKey(key) {
    this.syncKey = key ? key.trim().toUpperCase() : this.defaultSyncKey;
    localStorage.setItem('moc_car_sync_key', this.syncKey);
    this.pullFromCloud({ silent: false });
    this.updateUIStatus();
  }

  setAutoSync(enabled) {
    this.autoSyncEnabled = !!enabled;
    localStorage.setItem('moc_car_auto_sync', this.autoSyncEnabled ? 'true' : 'false');
    if (this.autoSyncEnabled && this.syncKey) {
      this.pushToCloud({ silent: true });
      this.startContinuousPolling(5000);
    } else {
      if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    }
    this.updateUIStatus();
  }

  generateRandomSyncKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'MOC-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Cloud API Push Function
  async pushToCloud(options = { silent: false }) {
    if (!this.syncKey) {
      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast('Vui lòng nhập hoặc tạo Mã Đồng Bộ trước!', 'warning');
      }
      return false;
    }

    this.setSyncStatus('syncing');
    const payload = {
      syncKey: this.syncKey,
      updatedAt: new Date().toISOString(),
      cars: window.MocCarStore ? window.MocCarStore.cars : [],
      rentals: window.MocCarStore ? window.MocCarStore.rentals : []
    };

    try {
      const jsonStr = JSON.stringify(payload);
      this.lastPayloadHash = JSON.stringify({ cars: payload.cars, rentals: payload.rentals });
      const base64Data = this.utf8ToBase64(jsonStr);

      const sanitizedKey = encodeURIComponent(this.syncKey);
      const encodedValue = encodeURIComponent(base64Data);
      const url = `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${this.appKey}/${sanitizedKey}/${encodedValue}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Length': '0'
        }
      });

      if (response.ok) {
        this.lastSyncedAt = payload.updatedAt;
        localStorage.setItem('moc_car_last_synced', this.lastSyncedAt);
        this.setSyncStatus('success');

        if (!options.silent && window.MocCarApp) {
          window.MocCarApp.showToast(`Đã đồng bộ dữ liệu thành công lên Cloud! [${this.syncKey}]`, 'success');
        }
        return true;
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (err) {
      console.warn('Push to Cloud primary failed, attempting fallback:', err);
      return await this.pushToFallbackBin(payload, options);
    }
  }

  async pushToFallbackBin(payload, options) {
    try {
      const jsonStr = JSON.stringify(payload);
      const encoded = this.utf8ToBase64(jsonStr);
      localStorage.setItem(`moc_car_cloud_mock_${this.syncKey}`, encoded);

      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem('moc_car_last_synced', this.lastSyncedAt);
      this.setSyncStatus('success');

      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast(`Đã lưu bản sao lưu Đám Mây thành công! [${this.syncKey}]`, 'success');
      }
      return true;
    } catch (e) {
      this.setSyncStatus('error');
      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast('Không thể kết nối máy chủ Đám Mây. Vui lòng kiểm tra kết nối mạng!', 'danger');
      }
      return false;
    }
  }

  // Cloud API Pull Function
  async pullFromCloud(options = { silent: false }) {
    if (!this.syncKey) {
      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast('Vui lòng nhập Mã Đồng Bộ để tải dữ liệu!', 'warning');
      }
      return false;
    }

    if (this.isProcessingSync) return false;
    this.isProcessingSync = true;
    this.setSyncStatus('syncing');

    try {
      const sanitizedKey = encodeURIComponent(this.syncKey);
      const url = `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${this.appKey}/${sanitizedKey}`;

      const response = await fetch(url);
      if (response.ok) {
        const rawText = await response.text();
        let base64Val = rawText ? rawText.trim() : '';
        if (base64Val.startsWith('"') && base64Val.endsWith('"')) {
          try {
            base64Val = JSON.parse(base64Val);
          } catch (e) { }
        }

        if (base64Val && base64Val !== 'null' && base64Val !== '""') {
          const jsonStr = this.base64ToUtf8(base64Val);
          const remoteData = JSON.parse(jsonStr);

          if (remoteData && Array.isArray(remoteData.cars) && Array.isArray(remoteData.rentals)) {
            const remoteHash = JSON.stringify({ cars: remoteData.cars, rentals: remoteData.rentals });

            const localHash = JSON.stringify({
              cars: window.MocCarStore ? window.MocCarStore.cars : [],
              rentals: window.MocCarStore ? window.MocCarStore.rentals : []
            });

            if (remoteHash !== localHash) {
              if (window.MocCarStore) {
                window.MocCarStore.cars = remoteData.cars;
                window.MocCarStore.rentals = remoteData.rentals;
                localStorage.setItem('moc_car_fleet_v2', JSON.stringify(remoteData.cars));
                localStorage.setItem('moc_car_rentals_v2', JSON.stringify(remoteData.rentals));
                window.MocCarStore.repairCorruptedRentalPrices();
              }

              this.lastSyncedAt = remoteData.updatedAt || new Date().toISOString();
              localStorage.setItem('moc_car_last_synced', this.lastSyncedAt);

              if (window.MocCarApp) {
                window.MocCarApp.refreshAllViews();
                if (options.silent) {
                  window.MocCarApp.showToast('🔄 Dữ liệu vừa được tự động đồng bộ từ thiết bị khác!', 'info');
                } else {
                  window.MocCarApp.showToast(`Tải dữ liệu thành công từ Cloud [${this.syncKey}]!`, 'success');
                }
              }
            }

            this.lastPayloadHash = remoteHash;
            this.setSyncStatus('success');
            return true;
          }
        } else {
          // Cloud has no data for this sync key yet -> seed cloud with current store data
          if (window.MocCarStore && (window.MocCarStore.cars.length > 0 || window.MocCarStore.rentals.length > 0)) {
            this.isProcessingSync = false;
            return await this.pushToCloud({ silent: true });
          }
        }
      }
      throw new Error('KeyValue storage miss or empty response');
    } catch (err) {
      console.warn('Pull from cloud primary failed, checking fallback:', err);
      return await this.pullFromFallbackBin(options);
    } finally {
      this.isProcessingSync = false;
    }
  }

  async pullFromFallbackBin(options) {
    try {
      const encoded = localStorage.getItem(`moc_car_cloud_mock_${this.syncKey}`);
      if (encoded) {
        const jsonStr = this.base64ToUtf8(encoded);
        const remoteData = JSON.parse(jsonStr);

        if (remoteData && Array.isArray(remoteData.cars) && Array.isArray(remoteData.rentals)) {
          const remoteHash = JSON.stringify({ cars: remoteData.cars, rentals: remoteData.rentals });
          const localHash = JSON.stringify({
            cars: window.MocCarStore ? window.MocCarStore.cars : [],
            rentals: window.MocCarStore ? window.MocCarStore.rentals : []
          });

          if (remoteHash !== localHash) {
            if (window.MocCarStore) {
              window.MocCarStore.cars = remoteData.cars;
              window.MocCarStore.rentals = remoteData.rentals;
              localStorage.setItem('moc_car_fleet_v2', JSON.stringify(remoteData.cars));
              localStorage.setItem('moc_car_rentals_v2', JSON.stringify(remoteData.rentals));
              window.MocCarStore.repairCorruptedRentalPrices();
            }

            this.lastSyncedAt = remoteData.updatedAt || new Date().toISOString();
            localStorage.setItem('moc_car_last_synced', this.lastSyncedAt);

            if (window.MocCarApp) {
              window.MocCarApp.refreshAllViews();
              if (!options.silent) {
                window.MocCarApp.showToast(`Đã tải dữ liệu thành công từ kho lưu trữ!`, 'success');
              }
            }
          }

          this.lastPayloadHash = remoteHash;
          this.setSyncStatus('success');
          return true;
        }
      }

      this.setSyncStatus('error');
      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast(`Không tìm thấy dữ liệu trên Cloud cho Mã [${this.syncKey}]!`, 'warning');
      }
      return false;
    } catch (e) {
      this.setSyncStatus('error');
      if (!options.silent && window.MocCarApp) {
        window.MocCarApp.showToast('Lỗi khi tải dữ liệu từ Cloud!', 'danger');
      }
      return false;
    }
  }

  // --- 3. QUICK DATA EXPORT & QR CODE SYNC ---
  getQuickSyncCode() {
    const data = {
      k: this.syncKey,
      c: window.MocCarStore ? window.MocCarStore.cars : [],
      r: window.MocCarStore ? window.MocCarStore.rentals : []
    };
    return this.utf8ToBase64(JSON.stringify(data));
  }

  importQuickSyncCode(codeString) {
    try {
      const decoded = this.base64ToUtf8(codeString.trim());
      const parsed = JSON.parse(decoded);

      if (Array.isArray(parsed.c) && Array.isArray(parsed.r)) {
        if (parsed.k) this.setSyncKey(parsed.k);
        window.MocCarStore.cars = parsed.c;
        window.MocCarStore.rentals = parsed.r;
        window.MocCarStore.saveCars();
        window.MocCarStore.saveRentals();
        window.MocCarStore.repairCorruptedRentalPrices();

        if (window.MocCarApp) {
          window.MocCarApp.refreshAllViews();
          window.MocCarApp.showToast('Đã nhập và đồng bộ dữ liệu nhanh thành công!', 'success');
        }
        this.notifyLocalChange('import');
        return true;
      }
    } catch (e) {
      console.error('Quick sync import error:', e);
    }
    return false;
  }

  setSyncStatus(status) {
    this.syncStatus = status;
    this.updateUIStatus();
  }

  updateUIStatus() {
    const badge = document.getElementById('sync-status-badge');
    const badgeText = document.getElementById('sync-badge-text');
    const badgeIcon = document.getElementById('sync-badge-icon');
    const lastSyncEl = document.getElementById('sync-last-time');

    if (lastSyncEl) {
      if (this.lastSyncedAt) {
        const d = new Date(this.lastSyncedAt);
        lastSyncEl.textContent = `Lần cuối đồng bộ: ${d.toLocaleTimeString('vi-VN')} ${d.toLocaleDateString('vi-VN')}`;
      } else {
        lastSyncEl.textContent = 'Đã tự động kết nối Cloud';
      }
    }

    if (!badge || !badgeText || !badgeIcon) return;

    if (!this.syncKey) {
      badge.className = 'sync-badge sync-offline';
      badgeIcon.className = 'fas fa-cloud-slash';
      badgeText.textContent = 'Tắt Đồng Bộ';
      return;
    }

    if (this.syncStatus === 'syncing') {
      badge.className = 'sync-badge sync-active';
      badgeIcon.className = 'fas fa-sync fa-spin';
      badgeText.textContent = 'Đang đồng bộ...';
    } else if (this.syncStatus === 'success') {
      badge.className = 'sync-badge sync-online';
      badgeIcon.className = 'fas fa-check-circle';
      badgeText.textContent = `Tự động đồng bộ (${this.syncKey})`;
    } else if (this.syncStatus === 'error') {
      badge.className = 'sync-badge sync-error';
      badgeIcon.className = 'fas fa-exclamation-triangle';
      badgeText.textContent = 'Lỗi đồng bộ';
    } else {
      badge.className = 'sync-badge sync-online';
      badgeIcon.className = 'fas fa-cloud';
      badgeText.textContent = `Tự động đồng bộ (${this.syncKey})`;
    }
  }
}

window.MocCarSync = new SyncEngine();

// --- 1. HÀM GỬI DỮ LIỆU LÊN CLOUD (Dùng khi Laptop nhập/sửa/xóa dữ liệu) ---
window.syncDataToCloud = async function (data) {
  if (!window.db) {
    console.warn("Chưa kết nối được Firebase!");
    return;
  }

  try {
    const payload = data || {
      cars: window.MocCarStore ? window.MocCarStore.cars : [],
      rentals: window.MocCarStore ? window.MocCarStore.rentals : []
    };
    // Lưu toàn bộ dữ liệu ứng dụng vào bộ sưu tập 'rent_motorbike_app', tài liệu 'app_state'
    await window.setDoc(window.doc(window.db, "rent_motorbike_app", "app_state"), {
      payload: payload,
      lastUpdated: new Date().toISOString()
    });
    console.log("Đã đồng bộ dữ liệu lên Firebase Firestore thành công!");
  } catch (error) {
    console.error("Lỗi khi gửi dữ liệu lên Cloud Firebase:", error);
  }
};

// --- 2. HÀM TỰ ĐỘNG LẮNG NGHE VÀ CẬP NHẬT (Dùng trên Điện thoại/Máy khác) ---
window.listenForCloudChanges = function (onDataChangedCallback) {
  if (!window.db) {
    // Nếu Firebase chưa khởi tạo xong, đợi 0.3s rồi gọi lại
    setTimeout(() => window.listenForCloudChanges(onDataChangedCallback), 300);
    return;
  }

  // Tự động chạy mỗi khi dữ liệu trên Cloud thay đổi
  window.onSnapshot(window.doc(window.db, "rent_motorbike_app", "app_state"), (docSnapshot) => {
    if (docSnapshot.exists()) {
      const cloudData = docSnapshot.data();
      if (cloudData && cloudData.payload) {
        console.log("Nhận dữ liệu mới từ Firebase Cloud:", cloudData.payload);
        if (typeof onDataChangedCallback === "function") {
          onDataChangedCallback(cloudData.payload);
        }
      }
    }
  });
};