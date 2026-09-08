import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, KeyboardAvoidingView,
  ScrollView, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { apiLogin, apiVerifyOtp } from '@/lib/api';

type Step = 'credentials' | 'otp';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading, login } = useAuth();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [telegramId, setTelegramId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateTransition = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleCredentials = async () => {
    if (!email || !password) {
      setError('Email aur password dono zaroori hain');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { telegramId: tid } = await apiLogin(email, password);
      setTelegramId(tid);
      animateTransition();
      setTimeout(() => setStep('otp'), 150);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message ?? 'Login failed. Check credentials.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const handleOtp = async () => {
    if (!otp || otp.length < 6) {
      setError('6-digit OTP enter karo');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await apiVerifyOtp(telegramId, otp);
      await login(user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/dashboard');
    } catch (e: any) {
      setError(e.message ?? 'OTP wrong ya expired hai');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#f5f0ff', '#ecdbfd', '#e8d5f8']} style={styles.gradient}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View style={[styles.logoArea, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.logoShield}>
              <View style={styles.logoInner}>
                <Text style={styles.logoLetter}>N</Text>
              </View>
            </View>
            <Text style={styles.appName}>AxeCodi</Text>
            <Text style={styles.appSub}>PANEL  ·  AXECODI.AI</Text>
          </Animated.View>

          {/* Step Dots */}
          <View style={styles.dots}>
            <View style={[styles.dot, step === 'credentials' && styles.dotActive]} />
            <View style={styles.dotLine} />
            <View style={[styles.dot, step === 'otp' && styles.dotActive]} />
          </View>

          {/* Card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            {step === 'credentials' ? (
              <>
                <Text style={styles.cardTitle}>Welcome Back</Text>
                <Text style={styles.cardSub}>Sign in to your account</Text>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="admin@axecodi.ai"
                    placeholderTextColor="#b8a0e0"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>PASSWORD</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      placeholder="••••••••"
                      placeholderTextColor="#b8a0e0"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                      <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.btn, busy && styles.btnDisabled]}
                  onPress={handleCredentials}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Sign In  →</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Verification</Text>
                <Text style={styles.cardSub}>Telegram pe 6-digit code bheja gaya hai</Text>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>OTP CODE</Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="000000"
                    placeholderTextColor="#b8a0e0"
                    value={otp}
                    onChangeText={t => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.btn, busy && styles.btnDisabled]}
                  onPress={handleOtp}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  {busy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnText}>Verify  →</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => { setStep('credentials'); setError(''); setOtp(''); animateTransition(); }}
                >
                  <Text style={styles.backText}>← Back to login</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

          <Text style={styles.footer}>AxeCodi Panel  ·  v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f0ff' },
  scroll: { alignItems: 'center', paddingHorizontal: 24 },

  logoArea: { alignItems: 'center', marginBottom: 28 },
  logoShield: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 12,
    marginBottom: 14,
  },
  logoInner: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoLetter: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  appName: { fontSize: 26, fontWeight: '800', color: '#2d1b4e', letterSpacing: 4 },
  appSub: { fontSize: 11, color: '#6b5b7d', letterSpacing: 2, marginTop: 4 },

  dots: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d8c8f0' },
  dotActive: { backgroundColor: '#7c3aed', transform: [{ scale: 1.2 }] },
  dotLine: { width: 40, height: 2, backgroundColor: '#d8c8f0', marginHorizontal: 6 },

  card: {
    width: '100%', backgroundColor: '#fff',
    borderRadius: 28, padding: 28,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#2d1b4e', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#6b5b7d', marginBottom: 24 },

  inputWrap: { marginBottom: 16 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#6b5b7d', letterSpacing: 1.5, marginBottom: 6 },
  input: {
    backgroundColor: '#f5efff', borderWidth: 1.5, borderColor: '#d8c8f0',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#2d1b4e',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeBtn: { position: 'absolute', right: 14, top: 13 },
  eyeText: { fontSize: 16 },
  otpInput: { fontSize: 28, letterSpacing: 12, textAlign: 'center', fontWeight: '700' },

  error: { color: '#ef4444', fontSize: 13, marginBottom: 12, fontWeight: '500' },

  btn: {
    backgroundColor: '#7c3aed', borderRadius: 16, paddingVertical: 15,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  backBtn: { alignItems: 'center', marginTop: 16 },
  backText: { color: '#7c3aed', fontSize: 14, fontWeight: '600' },

  footer: { marginTop: 32, fontSize: 11, color: '#b8a0e0', letterSpacing: 1 },
});
