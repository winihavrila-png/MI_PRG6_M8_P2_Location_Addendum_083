import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useContext,
} from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import * as Location from 'expo-location'; 

const HomeScreen = ({ navigation }) => {

  const { userData, logout } = useContext(AuthContext);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentTime, setCurrentTime] = useState('Memuat jam...');
  const [note, setNote] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const noteInputRef = useRef(null);

  // State QR Scanner (W7)
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState(null);
  const [isScanning, setIsScanning] = useState(true);
  const [showCamera, setShowCamera] = useState(false);


  const [locationStatus, setLocationStatus] = useState('checking'); // 'checking', 'valid', 'invalid', 'error'
  const [distance, setDistance] = useState(0);

  
  const KAMPUS_LAT = -6.3481107;
  const KAMPUS_LON = 107.1483022;
  const MAKSIMAL_JARAK_METER = 500; // besarin dulu biar bisa test scan QR

  const BASE_URL = "http://10.1.10.131:8080/api/presensi";

  const attendanceStats = useMemo(() => {
    return { totalPresent: 12, totalAbsent: 2 };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ✅ TAMBAHAN P2: Auto cek lokasi saat permission kamera sudah diputuskan
  useEffect(() => {
    if (permission && permission.granted) {
      verifyLocation();
    }
  }, [permission]);

  // ✅ TAMBAHAN P2: Haversine Formula - hitung jarak 2 koordinat (meter)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // ✅ TAMBAHAN P2: Fungsi verifikasi lokasi mahasiswa
  const verifyLocation = async () => {
    setLocationStatus('checking');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Akses Ditolak', 'Izin lokasi wajib diberikan untuk presensi.');
        setLocationStatus('error');
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });

      const jarakMeter = calculateDistance(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
        KAMPUS_LAT,
        KAMPUS_LON
      );

      setDistance(Math.round(jarakMeter));

      if (jarakMeter <= MAKSIMAL_JARAK_METER) {
        setLocationStatus('valid');
      } else {
        setLocationStatus('invalid');
      }
    } catch (error) {
      Alert.alert("Error Lokasi", "Gagal mengunci posisi satelit GPS Anda.");
      setLocationStatus('error');
    }
  };

  // Handler QR (W7) - tidak diubah
  const handleBarCodeScanned = ({ type, data }) => {
    if (!isScanning) return;
    setIsScanning(false);
    try {
      const qrData = JSON.parse(data);
      setScannedData(qrData);
      Alert.alert(
        "QR Code Terdeteksi",
        `Mata Kuliah: ${qrData.kodeMk}\nPertemuan: ${qrData.pertemuanKe}\nRuangan: ${qrData.ruangan}\n\nLanjutkan Presensi (Check-In)?`,
        [
          {
            text: "Batal",
            onPress: () => { setIsScanning(true); setScannedData(null); },
            style: "cancel"
          },
          {
            text: "Ya, Check In",
            onPress: () => handleSubmitPresensi(qrData)
          },
        ]
      );
    } catch (error) {
      Alert.alert("QR Tidak Valid", "Pastikan Anda memindai QR Code Presensi Dosen.");
      setIsScanning(true);
    }
  };

  // Submit presensi (W7) - tidak diubah
  const handleSubmitPresensi = async (qrData) => {
    if (isCheckedIn) return Alert.alert("Perhatian", "Anda sudah Check In.");
    setIsPosting(true);
    setShowCamera(false);
    const payload = {
      kodeMk: qrData.kodeMk,
      nimMhs: userData.mhsNim,
      pertemuanKe: qrData.pertemuanKe,
      date: new Date().toISOString().split('T')[0],
      jamPresensi: new Date().toLocaleTimeString('en-GB'),
      status: "Present",
      ruangan: qrData.ruangan
    };
    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (response.ok) {
        setIsCheckedIn(true);
        Alert.alert("Berhasil!", "Presensi sukses dicatat ke Database.", [
          { text: "Lihat Riwayat", onPress: () => navigation.navigate('HistoryTab') }
        ]);
      } else {
        Alert.alert("Gagal", result.message || "Terjadi kesalahan di server.");
      }
    } catch (error) {
      Alert.alert("Error Jaringan", "Pastikan IP Laptop benar dan API berjalan.");
      console.error(error);
    } finally {
      setIsPosting(false);
      setIsScanning(true);
      setScannedData(null);
    }
  };

  // Buka kamera (W7) - tidak diubah
  const handleOpenCamera = async () => {
    if (!permission || !permission.granted) {
      await requestPermission();
    }
    setIsScanning(true);
    setShowCamera(true);
  };

  // ✅ TAMBAHAN P2: Kondisi 1 - Permission kamera belum diputuskan
  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // ✅ TAMBAHAN P2: Kondisi 2 - Izin kamera ditolak
  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.infoText}>Aplikasi butuh akses kamera untuk memindai QR!</Text>
        <TouchableOpacity style={styles.buttonRequest} onPress={requestPermission}>
          <Text style={styles.buttonText}>Aktifkan Kamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ✅ TAMBAHAN P2: Kondisi 3 - Sedang mengecek GPS
  if (locationStatus === 'checking') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0056b3" />
        <Text style={styles.loadingText}>Memverifikasi Lokasi Anda...</Text>
        <Text style={{ color: 'gray', marginTop: 10 }}>
          Pastikan Anda berada di area Kampus.
        </Text>
      </View>
    );
  }

  // ✅ TAMBAHAN P2: Kondisi 4 - Lokasi di luar radius (blokir kamera!)
  if (locationStatus === 'invalid' || locationStatus === 'error') {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="block" size={80} color="#dc3545" style={{ marginBottom: 15 }} />
        <Text style={styles.errorTitle}>Akses Ditolak</Text>
        <Text style={styles.errorSubtitle}>
          Anda terdeteksi berada {distance} meter dari titik kampus.{'\n'}
          Maksimal jarak yang diizinkan adalah {MAKSIMAL_JARAK_METER} meter.
        </Text>
        <TouchableOpacity style={styles.buttonRequest} onPress={verifyLocation}>
          <Text style={styles.buttonText}>Cek Ulang Lokasi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ✅ TAMBAHAN P2: Kondisi 5 - Lokasi valid, tampilkan scanner QR
  if (showCamera) {
    return (
      <View style={{ flex: 1, backgroundColor: 'black' }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        >
          <View style={styles.overlay}>
            <View style={styles.unfocusedContainer} />
            <View style={styles.focusedContainer}>
              <View style={styles.borderCornerTopLeft} />
              <View style={styles.borderCornerTopRight} />
              <View style={styles.borderCornerBottomLeft} />
              <View style={styles.borderCornerBottomRight} />
            </View>

            {/* ✅ Badge Lokasi Valid di atas kotak scan */}
            <View style={styles.validLocationBadge}>
              <MaterialIcons name="check-circle" size={18} color="white" style={{ marginRight: 5 }} />
              <Text style={styles.validLocationText}>Lokasi Valid ({distance}m)</Text>
            </View>

            <View style={styles.unfocusedContainer}>
              <Text style={styles.scanText}>Arahkan Kamera ke QR Code Dosen</Text>
              {!isScanning && (
                <TouchableOpacity
                  style={[styles.buttonRequest, { marginTop: 12 }]}
                  onPress={() => setIsScanning(true)}
                >
                  <Text style={styles.buttonText}>Scan Lagi</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.buttonRequest, { marginTop: 12, backgroundColor: '#d9534f' }]}
                onPress={() => setShowCamera(false)}
              >
                <Text style={styles.buttonText}>Batal / Kembali</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // UI Utama
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.headerRow}>
          <Text style={styles.title}>Attendance App</Text>
          <Text style={styles.clockText}>{currentTime}</Text>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.icon}>
            <MaterialIcons name="person" size={40} color="#555" />
          </View>
          <View>
            <Text style={styles.name}>{userData?.mhsName}</Text>
            <Text>NIM : {userData?.mhsNim}</Text>
            <Text>Class : Informatika-2B</Text>
          </View>
        </View>

        <View style={styles.classCard}>
          <Text style={styles.subtitle}>Today's Class</Text>
          <Text>Mobile Programming (TRPL205)</Text>
          <Text>08:00 - 10:00</Text>
          <Text>Lab 3</Text>

          {isPosting ? (
            <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 15 }} />
          ) : isCheckedIn ? (
            <TouchableOpacity style={[styles.button, styles.buttonDisabled]} disabled={true}>
              <Text style={styles.buttonText}>✓ CHECKED IN</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.button, styles.buttonActive]} onPress={handleOpenCamera}>
              <MaterialIcons name="qr-code-scanner" size={20} color="white" />
              <Text style={[styles.buttonText, { marginLeft: 8 }]}>SCAN QR CODE DOSEN</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{attendanceStats.totalPresent}</Text>
            <Text style={styles.statLabel}>Total Present</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: 'red' }]}>{attendanceStats.totalAbsent}</Text>
            <Text style={styles.statLabel}>Total Absent</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Styles asli
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 20 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0056A0' },
  clockText: { fontSize: 16, color: '#555' },
  logoutButton: {
    marginLeft: 12, backgroundColor: '#d9534f',
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    padding: 16, borderRadius: 10, marginBottom: 16, elevation: 2,
  },
  icon: { marginRight: 12 },
  name: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  classCard: {
    backgroundColor: 'white', padding: 16,
    borderRadius: 10, marginBottom: 16, elevation: 2,
  },
  subtitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 6, color: '#333' },
  button: {
    flexDirection: 'row', padding: 14, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  buttonActive: { backgroundColor: '#0056A0' },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  statsCard: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: 'white', padding: 16, borderRadius: 10, elevation: 2,
  },
  statBox: { alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: 'bold', color: '#0056A0' },
  statLabel: { fontSize: 13, color: '#666' },

  // Styles tambahan P2
  centerContainer: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', backgroundColor: '#f4f6f9', padding: 20,
  },
  loadingText: { marginTop: 20, fontSize: 18, fontWeight: 'bold', color: '#333' },
  infoText: { color: '#333', textAlign: 'center', margin: 30, fontSize: 16 },
  buttonRequest: {
    backgroundColor: '#0056b3', padding: 15,
    borderRadius: 10, alignSelf: 'center',
  },
  errorTitle: { fontSize: 24, fontWeight: 'bold', color: '#dc3545', marginBottom: 10 },
  errorSubtitle: {
    fontSize: 16, textAlign: 'center',
    color: '#666', lineHeight: 24, marginBottom: 20,
  },

  // Styles Scanner & Overlay (W7)
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  unfocusedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  focusedContainer: {
    width: 250, height: 250, alignSelf: 'center',
    backgroundColor: 'transparent', position: 'relative',
  },
  scanText: {
    color: 'white', fontSize: 16, marginTop: 20, fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 5,
  },

  // ✅ Badge Lokasi Valid
  validLocationBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(40, 167, 69, 0.9)',
    paddingHorizontal: 15, paddingVertical: 8,
    borderRadius: 20, alignSelf: 'center', marginBottom: 30,
  },
  validLocationText: { color: 'white', fontWeight: 'bold' },

  // Sudut kotak biru (W7)
  borderCornerTopLeft: {
    position: 'absolute', top: 0, left: 0, width: 40, height: 40,
    borderTopWidth: 5, borderLeftWidth: 5, borderColor: '#007bff',
  },
  borderCornerTopRight: {
    position: 'absolute', top: 0, right: 0, width: 40, height: 40,
    borderTopWidth: 5, borderRightWidth: 5, borderColor: '#007bff',
  },
  borderCornerBottomLeft: {
    position: 'absolute', bottom: 0, left: 0, width: 40, height: 40,
    borderBottomWidth: 5, borderLeftWidth: 5, borderColor: '#007bff',
  },
  borderCornerBottomRight: {
    position: 'absolute', bottom: 0, right: 0, width: 40, height: 40,
    borderBottomWidth: 5, borderRightWidth: 5, borderColor: '#007bff',
  },
});

export default HomeScreen;