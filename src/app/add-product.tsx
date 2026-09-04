import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { isValidIMEI } from '@/lib/validation';

const POPULAR_BRANDS = ['OPPO', 'Samsung', 'Apple', 'Vivo', 'Xiaomi', 'Realme', 'Infinix', 'Tecno'];
const RAM_OPTIONS = ['4GB', '6GB', '8GB', '12GB', '16GB'];
const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];

export default function AddProductScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' || scheme === 'light' ? 'light' : 'dark'];
  const isDark = scheme === 'dark';

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [ram, setRam] = useState('8GB');
  const [storage, setStorage] = useState('128GB');
  const [color, setColor] = useState('');
  const [imei, setImei] = useState('');
  const [price, setPrice] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  async function pickMobileImage() {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined' && document.createElement) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result) {
                setImage(reader.result.toString());
              }
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Gallery permission is required to choose a mobile picture from device.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setImage(`data:image/jpeg;base64,${asset.base64}`);
        } else if (asset.uri) {
          setImage(asset.uri);
        }
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not open device gallery.');
    }
  }

  async function handleSave() {
    const trimmedBrand = brand.trim();
    const trimmedModel = model.trim();
    const trimmedImei = imei.trim();
    const parsedPrice = Number(price);

    if (!trimmedBrand) {
      Alert.alert('Missing Brand', 'Please enter or select a mobile brand (e.g. OPPO, Samsung).');
      return;
    }
    if (!trimmedModel) {
      Alert.alert('Missing Model', 'Please enter mobile model name (e.g. Reno 11).');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price greater than 0.');
      return;
    }
    if (trimmedImei && !isValidIMEI(trimmedImei)) {
      Alert.alert('Invalid IMEI', 'IMEI number must be exactly 15 digits.');
      return;
    }

    setSaving(true);
    const fullName = trimmedBrand ? `${trimmedBrand} ${trimmedModel}` : trimmedModel;
    const specsObj = {
      brand: trimmedBrand,
      model: trimmedModel,
      ram: ram.trim(),
      storage: storage.trim(),
      color: color.trim(),
      imei: imei.trim(),
      image: image.trim(),
    };
    const descJson = JSON.stringify(specsObj);

    const payload: Record<string, unknown> = {
      name: fullName,
      price: parsedPrice,
      description: descJson,
      brand: trimmedBrand || null,
      model: trimmedModel || null,
      ram: ram.trim() || null,
      storage: storage.trim() || null,
      color: color.trim() || null,
      imei: imei.trim() || null,
    };

    let { error } = await supabase.from('products').insert(payload);
    if (error) {
      // Fallback if specific columns are not added to Supabase table yet
      delete payload.brand;
      delete payload.model;
      delete payload.ram;
      delete payload.storage;
      delete payload.color;
      delete payload.imei;
      const retry = await supabase.from('products').insert(payload);
      error = retry.error;
    }
    setSaving(false);

    if (error) {
      Alert.alert('Could not save mobile', error.message);
      return;
    }

    router.back();
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: colors.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.form}>

            {/* Live Mobile Preview */}
            <View style={[styles.previewCard, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
              {image ? (
                <Image source={{ uri: image }} style={styles.previewImageThumb} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 36 }}>📱</Text>
              )}
              <ThemedText type="smallBold" style={{ fontSize: 18, textAlign: 'center' }}>
                {[brand, model].filter(Boolean).join(' ') || 'Mobile Name'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[ram ? `${ram} RAM` : '', storage ? `${storage} Storage` : '']
                  .filter(Boolean)
                  .join(' / ') || 'Specs Preview'}
              </ThemedText>
              <Text style={styles.previewPrice}>
                {price ? `PKR ${Number(price).toLocaleString()}` : 'PKR 0'}
              </Text>
            </View>

            {/* Mobile Picture Field */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Mobile Picture</ThemedText>
              {image ? (
                <View style={styles.imagePreviewRow}>
                  <Image source={{ uri: image }} style={styles.previewImageThumb} resizeMode="cover" />
                  <Pressable style={styles.removeImgBtn} onPress={() => setImage('')}>
                    <Text style={styles.removeImgText}>✕ Remove Picture</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.horizontalUploadBtn} onPress={() => void pickMobileImage()}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                  <Text style={styles.horizontalUploadLabel}>Upload Photo from Gallery</Text>
                </Pressable>
              )}
            </View>

            {/* Brand */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Brand *</ThemedText>
              <TextInput
                value={brand}
                onChangeText={setBrand}
                placeholder="e.g. OPPO, Samsung, Apple"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {POPULAR_BRANDS.map((b) => (
                  <Pressable
                    key={b}
                    style={[styles.chip, brand === b && styles.chipActive]}
                    onPress={() => setBrand(b)}>
                    <Text style={[styles.chipText, brand === b && styles.chipTextActive]}>{b}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Model */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Model *</ThemedText>
              <TextInput
                value={model}
                onChangeText={setModel}
                placeholder="e.g. Reno 11, Galaxy A55, iPhone 15"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* RAM */}
            <View style={styles.field}>
              <ThemedText type="smallBold">RAM</ThemedText>
              <TextInput
                value={ram}
                onChangeText={setRam}
                placeholder="e.g. 8GB"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {RAM_OPTIONS.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.chip, ram === r && styles.chipActive]}
                    onPress={() => setRam(r)}>
                    <Text style={[styles.chipText, ram === r && styles.chipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Storage */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Storage</ThemedText>
              <TextInput
                value={storage}
                onChangeText={setStorage}
                placeholder="e.g. 128GB"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {STORAGE_OPTIONS.map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.chip, storage === s && styles.chipActive]}
                    onPress={() => setStorage(s)}>
                    <Text style={[styles.chipText, storage === s && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Color */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Color</ThemedText>
              <TextInput
                value={color}
                onChangeText={setColor}
                placeholder="e.g. Midnight Black, Ocean Blue"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* IMEI */}
            <View style={styles.field}>
              <ThemedText type="smallBold">IMEI Number</ThemedText>
              <TextInput
                value={imei}
                onChangeText={setImei}
                placeholder="15-digit IMEI number"
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* Price */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Price (PKR) *</ThemedText>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="e.g. 70000"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            <Pressable
              style={[styles.saveButton, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void handleSave()}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.saveLabel}>
                  Save Mobile Product
                </ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  form: { gap: Spacing.three, paddingTop: Spacing.three, paddingBottom: 40 },
  field: { gap: 6 },
  previewCard: {
    padding: Spacing.four,
    borderRadius: 16,
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.two,
  },
  previewPrice: {
    color: '#D97706',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  horizontalUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  horizontalUploadLabel: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '700',
  },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  previewImageThumb: {
    width: 70,
    height: 70,
    borderRadius: 10,
  },
  removeImgBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  removeImgText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 15,
  },
  chipRow: { gap: 8, paddingTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  chipActive: {
    backgroundColor: '#2563EB',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  saveButton: {
    marginTop: Spacing.two,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  saveLabel: { color: '#fff', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
