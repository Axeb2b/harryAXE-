import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Logout',
      'Kya aap logout karna chahte hain?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  };

  if (!user) return null;

  const initial = (user.username || user.telegramId || 'U').charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : 0 }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={18} color="#6b5b7d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{initial}</Text>
          </View>
          <Text style={styles.userName}>{user.username || 'User'}</Text>
          <View style={styles.badgeRow}>
            {user.isAdmin && (
              <View style={styles.adminBadge}>
                <Feather name="shield" size={11} color="#7c3aed" />
                <Text style={styles.adminText}>Admin</Text>
              </View>
            )}
            <View style={styles.idBadge}>
              <Feather name="hash" size={11} color="#6b5b7d" />
              <Text style={styles.idText}>{user.telegramId}</Text>
            </View>
          </View>
        </View>

        {/* Account info */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="user" label="Username" value={user.username || '—'} />
            <View style={styles.divider} />
            <InfoRow icon="send" label="Telegram ID" value={user.telegramId} />
            <View style={styles.divider} />
            <InfoRow icon="shield" label="Role" value={user.isAdmin ? 'Administrator' : 'Operator'} />
          </View>
        </View>

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APPLICATION</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="cpu" label="Panel" value="AxeCodi Panel" />
            <View style={styles.divider} />
            <InfoRow icon="globe" label="Server" value="axecodi.ai" />
            <View style={styles.divider} />
            <InfoRow icon="tag" label="Version" value="1.0.0" />
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>AxeCodi Panel  ·  Build 1.0.0  ·  AXECODI.AI</Text>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={14} color="#7c3aed" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f0ff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#f5f0ff',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#ecdbfd', borderWidth: 1, borderColor: '#d8c8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#2d1b4e' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 20 },

  avatarCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#d8c8f0',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  avatarLetter: { fontSize: 36, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 20, fontWeight: '700', color: '#2d1b4e', marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5efff', borderWidth: 1, borderColor: '#d8c8f0',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
  },
  adminText: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  idBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f5efff', borderWidth: 1, borderColor: '#d8c8f0',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
  },
  idText: { fontSize: 12, fontWeight: '600', color: '#6b5b7d' },

  section: { gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#6b5b7d', letterSpacing: 1.5, paddingLeft: 4 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#d8c8f0',
    overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  infoIcon: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#f5efff',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  infoLabel: { fontSize: 14, color: '#6b5b7d', flex: 1 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#2d1b4e', maxWidth: '50%' },
  divider: { height: 1, backgroundColor: '#f5efff', marginLeft: 58 },

  logoutBtn: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ef4444',
    borderRadius: 20, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  logoutBtnDisabled: { opacity: 0.5 },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#ef4444' },

  footer: { textAlign: 'center', fontSize: 11, color: '#b8a0e0', letterSpacing: 0.5 },
});
