import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { fetchAllDevices } from '@/lib/firebase';
import { normalizeDevice, getBatteryNum, type NormalizedDevice } from '@/lib/normalizeDevice';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [devices, setDevices] = useState<NormalizedDevice[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadDevices = useCallback(async () => {
    try {
      const raw = await fetchAllDevices();
      const list = Object.entries(raw)
        .map(([id, data]) => normalizeDevice(id, data as Record<string, any>))
        .sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));
      setDevices(list);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadDevices();
    const interval = setInterval(loadDevices, 15000);
    return () => clearInterval(interval);
  }, [loadDevices]);

  const onRefresh = () => { setRefreshing(true); loadDevices(); };

  const filtered = devices.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.model.toLowerCase().includes(q) || d.phone.includes(q) || (d.ip_address ?? '').includes(q);
  });

  const onlineCount = devices.filter(d => d.isOnline).length;

  const renderDevice = ({ item, index }: { item: NormalizedDevice; index: number }) => (
    <DeviceCard device={item} index={index} onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/device/${item.id}`);
    }} />
  );

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : 0 }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.miniLogo}>
            <Text style={styles.miniLogoText}>N</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>NEXUS</Text>
            <Text style={styles.headerSub}>Control Panel</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => router.push('/profile')}
          activeOpacity={0.7}
        >
          <Feather name="user" size={18} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{devices.length}</Text>
          <Text style={styles.statLabel}>Devices</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#10b981' }]}>{onlineCount}</Text>
          <Text style={styles.statLabel}>Online</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#9ca3af' }]}>{devices.length - onlineCount}</Text>
          <Text style={styles.statLabel}>Offline</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color="#6b5b7d" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search model, phone, IP..."
          placeholderTextColor="#b8a0e0"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={15} color="#6b5b7d" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* List */}
      <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          renderItem={renderDevice}
          contentContainerStyle={[
            styles.list,
            filtered.length === 0 && styles.listEmpty,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
          scrollEnabled={filtered.length > 0}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="smartphone" size={40} color="#d8c8f0" />
              <Text style={styles.emptyTitle}>{loading ? 'Loading devices…' : 'No devices found'}</Text>
              <Text style={styles.emptySub}>{search ? 'Try a different search' : 'Awaiting device connections'}</Text>
            </View>
          }
        />
      </Animated.View>
    </View>
  );
}

function OnlineDot({ online }: { online: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!online) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [online]);

  return (
    <View style={dotStyles.wrap}>
      {online && (
        <Animated.View style={[dotStyles.ring, { transform: [{ scale: pulse }] }]} />
      )}
      <View style={[dotStyles.dot, { backgroundColor: online ? '#10b981' : '#9ca3af' }]} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, position: 'absolute' },
  ring: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#10b98133', position: 'absolute' },
});

function DeviceCard({ device, onPress, index }: { device: NormalizedDevice; onPress: () => void; index: number }) {
  const battNum = getBatteryNum(device.battery);
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
        <View style={[styles.cardAccent, { backgroundColor: device.isOnline ? '#10b981' : '#d8c8f0' }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={styles.cardLeft}>
              <OnlineDot online={device.isOnline} />
              <View style={styles.cardText}>
                <Text style={styles.modelName} numberOfLines={1}>{device.model}</Text>
                <Text style={styles.phoneNum} numberOfLines={1}>{device.phone || 'No number'}</Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              <Text style={[styles.statusBadge, { color: device.isOnline ? '#10b981' : '#9ca3af', backgroundColor: device.isOnline ? '#10b98115' : '#f3f4f6' }]}>
                {device.isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          <View style={styles.cardMeta}>
            {device.battery ? (
              <View style={styles.metaChip}>
                <Feather name="battery" size={11} color={battNum <= 20 ? '#f59e0b' : '#6b5b7d'} />
                <Text style={[styles.metaText, battNum <= 20 && { color: '#f59e0b' }]}>{device.battery}</Text>
              </View>
            ) : null}
            {device.androidV ? (
              <View style={styles.metaChip}>
                <Feather name="cpu" size={11} color="#6b5b7d" />
                <Text style={styles.metaText}>Android {device.androidV}</Text>
              </View>
            ) : null}
            {device.ip_address ? (
              <View style={styles.metaChip}>
                <Feather name="wifi" size={11} color="#6b5b7d" />
                <Text style={styles.metaText}>{device.ip_address}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Feather name="chevron-right" size={16} color="#d8c8f0" style={styles.arrow} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f5f0ff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#f5f0ff',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniLogo: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  miniLogoText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#2d1b4e', letterSpacing: 3 },
  headerSub: { fontSize: 10, color: '#6b5b7d', letterSpacing: 1 },
  profileBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#ecdbfd', borderWidth: 1, borderColor: '#d8c8f0',
    alignItems: 'center', justifyContent: 'center',
  },

  statsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ecdbfd', marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 12, marginBottom: 12, borderWidth: 1, borderColor: '#d8c8f0',
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#2d1b4e' },
  statLabel: { fontSize: 10, color: '#6b5b7d', letterSpacing: 0.5, marginTop: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: '#d8c8f0' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#d8c8f0',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#2d1b4e' },

  list: { paddingHorizontal: 16, paddingTop: 4 },
  listEmpty: { flex: 1, justifyContent: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 20, marginBottom: 10,
    borderWidth: 1.5, borderColor: '#d8c8f0', overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardText: { flex: 1 },
  modelName: { fontSize: 15, fontWeight: '700', color: '#2d1b4e' },
  phoneNum: { fontSize: 12, color: '#6b5b7d', marginTop: 1 },
  cardRight: {},
  statusBadge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5efff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  metaText: { fontSize: 11, color: '#6b5b7d', fontWeight: '500' },
  arrow: { marginRight: 14 },

  emptyState: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#2d1b4e' },
  emptySub: { fontSize: 13, color: '#6b5b7d' },
});
