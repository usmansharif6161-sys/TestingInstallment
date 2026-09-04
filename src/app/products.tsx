import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Barcode, Cpu, HardDrive, MoreVertical, Palette, Pencil, Search, Tag, Trash2, X } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { formatMoney } from '@/lib/installment';
import { supabase } from '@/lib/supabase';
import { getProductSpecs, type Product, type ProductSpecs } from '@/lib/types';
import { isValidIMEI } from '@/lib/validation';

const POPULAR_BRANDS = ['OPPO', 'Samsung', 'Apple', 'Vivo', 'Xiaomi', 'Realme', 'Infinix', 'Tecno'];
const RAM_OPTIONS = ['4GB', '6GB', '8GB', '12GB', '16GB'];
const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];

export default function ProductsScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Form state for Add/Edit mobile
  const [pBrand, setPBrand] = useState('');
  const [pModel, setPModel] = useState('');
  const [pRam, setPRam] = useState('');
  const [pStorage, setPStorage] = useState('');
  const [pColor, setPColor] = useState('');
  const [pImei, setPImei] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pImages, setPImages] = useState<string[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function pickModalImage() {
    if (pImages.length >= 2) {
      Alert.alert('Limit Reached', 'You can upload a maximum of 2 pictures.');
      return;
    }
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
                setPImages((prev) => [...prev, reader.result!.toString()]);
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
        const newUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        if (newUri) {
          setPImages((prev) => [...prev, newUri]);
        }
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not open device gallery.');
    }
  }

  const loadProducts = useCallback(async () => {
    let query = supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (user?.id) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (!error) setProducts((data ?? []) as Product[]);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadProducts();
    }, [loadProducts])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const specs = getProductSpecs(p);
      return (
        p.name.toLowerCase().includes(q) ||
        specs.brand.toLowerCase().includes(q) ||
        specs.model.toLowerCase().includes(q) ||
        specs.ram.toLowerCase().includes(q) ||
        specs.storage.toLowerCase().includes(q) ||
        specs.color.toLowerCase().includes(q) ||
        specs.imei.toLowerCase().includes(q)
      );
    });
  }, [products, search]);

  function openModal() {
    setEditingProductId(null);
    setPBrand('');
    setPModel('');
    setPRam('');
    setPStorage('');
    setPColor('');
    setPImei('');
    setPPrice('');
    setPImages([]);
    setShowModal(true);
  }

  async function handleSave() {
    const trimmedBrand = pBrand.trim();
    const trimmedModel = pModel.trim();
    const price = Number(pPrice);

    if (!trimmedModel && !trimmedBrand) {
      Alert.alert('Missing Model', 'Please enter a Mobile Model or Brand.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price (PKR).');
      return;
    }

    setSaving(true);
    const fullName = trimmedBrand ? `${trimmedBrand} ${trimmedModel}` : trimmedModel;
    const primaryImg = pImages[0] || '';
    const specsObj = {
      brand: trimmedBrand,
      model: trimmedModel,
      ram: pRam.trim(),
      storage: pStorage.trim(),
      color: pColor.trim(),
      imei: pImei.trim(),
      image: primaryImg,
      images: pImages,
    };
    const descJson = JSON.stringify(specsObj);

    const payload: Record<string, unknown> = {
      name: fullName,
      price,
      description: descJson,
      brand: trimmedBrand || null,
      model: trimmedModel || null,
      ram: pRam.trim() || null,
      storage: pStorage.trim() || null,
      color: pColor.trim() || null,
      imei: pImei.trim() || null,
      ...(user?.id ? { user_id: user.id } : {}),
    };

    let error: any = null;
    if (editingProductId) {
      const res = await supabase.from('products').update(payload).eq('id', editingProductId);
      error = res.error;
      if (error) {
        delete payload.brand;
        delete payload.model;
        delete payload.ram;
        delete payload.storage;
        delete payload.color;
        delete payload.imei;
        const retry = await supabase.from('products').update(payload).eq('id', editingProductId);
        error = retry.error;
      }
    } else {
      const res = await supabase.from('products').insert(payload);
      error = res.error;
      if (error) {
        delete payload.brand;
        delete payload.model;
        delete payload.ram;
        delete payload.storage;
        delete payload.color;
        delete payload.imei;
        const retry = await supabase.from('products').insert(payload);
        error = retry.error;
      }
    }

    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }

    setEditingProductId(null);
    setShowModal(false);
    void loadProducts();
  }

  async function handleDeleteProduct(product: Product) {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('products').delete().eq('id', product.id);
            if (error) {
              Alert.alert('Could not delete', error.message);
            } else {
              void loadProducts();
            }
          },
        },
      ]
    );
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
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle" style={styles.title}>Products</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {loading ? '...' : `${products.length} mobile${products.length !== 1 ? 's' : ''} available`}
            </ThemedText>
          </View>
          <Pressable style={styles.headerAddBtn} onPress={openModal}>
            <Text style={styles.headerAddBtnLabel}>＋ Add Product</Text>
          </Pressable>
        </View>

        {/* ── Search Bar ─────────────────────────────────────── */}
        <View style={[styles.searchWrap, { backgroundColor: colors.backgroundElement }]}>
          <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search phones..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* ── List ───────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadProducts();
                }}
                tintColor="#2563EB"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 56 }}>📱</Text>
                <ThemedText type="smallBold">
                  {search ? 'No results found' : 'Keep adding products'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {search ? 'Try a different search term.' : 'Add more phones to grow your inventory'}
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => (
              <PhoneCard
                product={item}
                router={router}
                onDelete={() => void handleDeleteProduct(item)}
                onEdit={() => {
                  // populate form then open edit modal
                  setEditingProductId(item.id);
                  const specs = getProductSpecs(item);
                  setPBrand(specs.brand);
                  setPModel(specs.model);
                  setPRam(specs.ram);
                  setPStorage(specs.storage);
                  setPColor(specs.color);
                  setPImei(specs.imei);
                  setPPrice(String(item.price));
                  setPImages(specs.images || (specs.image ? [specs.image] : []));
                  setShowModal(true);
                }}
              />
            )}
          />
        )}
      </SafeAreaView>

      <TabBar />

      {/* ── Add / Edit Product Modal ──────────────────────────── */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modalRoot, { backgroundColor: isDark ? '#0D1117' : '#F8FAFC' }]}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: isDark ? '#1F2937' : '#E5E7EB' }]}>
              <Pressable onPress={() => setShowModal(false)}>
                <Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                {editingProductId ? 'Edit Mobile' : 'Add Mobile'}
              </ThemedText>
              <Pressable onPress={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#2563EB" />
                ) : (
                  <Text style={{ color: '#2563EB', fontSize: 16, fontWeight: '700' }}>
                    {editingProductId ? 'Update' : 'Save'}
                  </Text>
                )}
              </Pressable>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={styles.modalForm}>

                {/* Live Preview Card */}
                <View style={[styles.previewCard, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
                  {pImages[0] ? (
                    <Image source={{ uri: pImages[0] }} style={{ width: 70, height: 70, borderRadius: 10, marginBottom: 4 }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 36 }}>📱</Text>
                  )}
                  <Text style={[styles.previewName, { color: colors.text }]}>
                    {[pBrand, pModel].filter(Boolean).join(' ') || 'Mobile Name'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {[pRam ? `${pRam} RAM` : '', pStorage ? `${pStorage} Storage` : '']
                      .filter(Boolean)
                      .join(' / ') || 'Specs Preview'}
                  </Text>
                  <Text style={styles.previewPrice}>
                    {pPrice ? formatMoney(Number(pPrice)) : 'PKR 0'}
                  </Text>
                </View>

                {/* Mobile Picture Field (Max 2) */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">Mobile Pictures (Max 2)</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
                    {pImages.map((imgUri, index) => (
                      <View key={index} style={{ position: 'relative', width: 72, height: 72 }}>
                        <Image
                          source={{ uri: imgUri }}
                          style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}
                          resizeMode="cover"
                        />
                        {/* Top-Right clean white circle badge with crisp black X icon */}
                        <Pressable
                          hitSlop={10}
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: '#FFFFFF',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.2,
                            shadowRadius: 3,
                            elevation: 4,
                          }}
                          onPress={() => setPImages((prev) => prev.filter((_, i) => i !== index))}>
                          <X size={13} color="#000000" strokeWidth={2.5} />
                        </Pressable>
                      </View>
                    ))}

                    {pImages.length < 2 && (
                      <Pressable
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderStyle: 'dashed',
                          borderColor: '#2563EB',
                          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                        }}
                        onPress={() => void pickModalImage()}>
                        <Text style={{ fontSize: 20 }}>📷</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>
                          {pImages.length === 0 ? 'Add Photo' : '2nd Photo'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Brand */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">Brand *</ThemedText>
                  <TextInput
                    value={pBrand}
                    onChangeText={setPBrand}
                    placeholder="e.g. OPPO, Samsung, Apple"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {POPULAR_BRANDS.map((b) => (
                      <Pressable
                        key={b}
                        style={[styles.chip, pBrand === b && styles.chipActive]}
                        onPress={() => setPBrand(b)}>
                        <Text style={[styles.chipText, pBrand === b && styles.chipTextActive]}>{b}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Model */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">Model *</ThemedText>
                  <TextInput
                    value={pModel}
                    onChangeText={setPModel}
                    placeholder="e.g. Reno 11"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>

                {/* RAM */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">RAM</ThemedText>
                  <TextInput
                    value={pRam}
                    onChangeText={setPRam}
                    placeholder="e.g. 8GB"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {RAM_OPTIONS.map((r) => (
                      <Pressable
                        key={r}
                        style={[styles.chip, pRam === r && styles.chipActive]}
                        onPress={() => setPRam(r)}>
                        <Text style={[styles.chipText, pRam === r && styles.chipTextActive]}>{r}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Storage */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">Storage</ThemedText>
                  <TextInput
                    value={pStorage}
                    onChangeText={setPStorage}
                    placeholder="e.g. 128GB"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {STORAGE_OPTIONS.map((s) => (
                      <Pressable
                        key={s}
                        style={[styles.chip, pStorage === s && styles.chipActive]}
                        onPress={() => setPStorage(s)}>
                        <Text style={[styles.chipText, pStorage === s && styles.chipTextActive]}>{s}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                {/* Color */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">Color</ThemedText>
                  <TextInput
                    value={pColor}
                    onChangeText={setPColor}
                    placeholder="e.g. Black, Blue"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>

                {/* IMEI */}
                <View style={styles.field}>
                  <ThemedText type="smallBold">IMEI Number</ThemedText>
                  <TextInput
                    value={pImei}
                    onChangeText={setPImei}
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
                    value={pPrice}
                    onChangeText={setPPrice}
                    placeholder="e.g. 70000"
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </Modal>
    </ThemedView>
  );
}

// ── Phone Card (Matches exact UI in screenshot) ────────────────────────────

function PhoneCard({
  product,
  router,
  onDelete,
  onEdit,
}: {
  product: Product;
  router: ReturnType<typeof useRouter>;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[isDark ? 'dark' : 'light'];
  const specs: ProductSpecs = getProductSpecs(product);
  const cardBg = isDark ? '#111827' : '#FFFFFF';

  // Floating dropdown menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const dotsBtnRef = useRef<View>(null);

  const titleText = specs.model || product.name;
  const subSpecsText =
    [specs.ram ? `${specs.ram} RAM` : '', specs.storage ? `${specs.storage} Storage` : '']
      .filter(Boolean)
      .join(' / ') || (specs.brand ? `Brand: ${specs.brand}` : 'Smartphone');

  return (
    <View style={[phoneStyles.card, { backgroundColor: cardBg, borderColor: isDark ? '#1F2937' : '#E5E7EB' }]}>
      {/* ── Top Section: Phone Graphic/Photo Left + Info Right ─────────────────── */}
      <View style={phoneStyles.topSection}>
        {/* Phone Graphic / Image Container */}
        <View style={phoneStyles.imageWrap}>
          {specs.image ? (
            <Image
              source={{ uri: specs.image }}
              style={phoneStyles.uploadedImage}
              resizeMode="cover"
            />
          ) : (
            <View style={phoneStyles.phoneFrame}>
              <View style={phoneStyles.phoneScreen}>
                <View style={phoneStyles.cameraNotch} />
                <View style={phoneStyles.screenWallpaper}>
                  <Text style={{ fontSize: 28 }}>📱</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Right Info Column */}
        <View style={phoneStyles.headerInfo}>
          <View style={phoneStyles.titleRow}>
            <ThemedText type="smallBold" numberOfLines={1} style={phoneStyles.modelTitle}>
              {titleText}
            </ThemedText>
            <Pressable
              ref={dotsBtnRef}
              hitSlop={12}
              style={phoneStyles.menuBtn}
              onPress={() => {
                dotsBtnRef.current?.measure((_x, _y, _w, h, _px, py) => {
                  setMenuPos({ top: py + h + 6, right: 12 });
                  setMenuVisible(true);
                });
              }}>
              <MoreVertical size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={phoneStyles.subSpecs}>
            {subSpecsText}
          </ThemedText>

          <Text style={phoneStyles.priceText}>
            {formatMoney(product.price)}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={[phoneStyles.divider, { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' }]} />

      {/* ── Specs Row (3 Columns: RAM, Storage, Category/Brand) ─────────── */}
      <View style={phoneStyles.specsGrid}>
        <View style={phoneStyles.specCol}>
          <View style={[phoneStyles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
            <Cpu size={16} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[phoneStyles.specLabel, { color: colors.textSecondary }]}>RAM</Text>
            <Text style={[phoneStyles.specValue, { color: colors.text }]} numberOfLines={1}>
              {specs.ram || '8GB'}
            </Text>
          </View>
        </View>

        <View style={phoneStyles.specCol}>
          <View style={[phoneStyles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#F5F3FF' }]}>
            <HardDrive size={16} color="#8B5CF6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[phoneStyles.specLabel, { color: colors.textSecondary }]}>Storage</Text>
            <Text style={[phoneStyles.specValue, { color: colors.text }]} numberOfLines={1}>
              {specs.storage || '128GB'}
            </Text>
          </View>
        </View>

        <View style={phoneStyles.specCol}>
          <View style={[phoneStyles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#ECFDF5' }]}>
            <Tag size={16} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[phoneStyles.specLabel, { color: colors.textSecondary }]}>Brand</Text>
            <Text style={[phoneStyles.specValue, { color: colors.text }]} numberOfLines={1}>
              {specs.brand || 'Smartphone'}
            </Text>
          </View>
        </View>
      </View>


      {/* Floating Dropdown Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={phoneStyles.dropdownOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[phoneStyles.dropdownCaret, { top: menuPos.top - 7, right: menuPos.right + 12 }]} />
          <View style={[phoneStyles.dropdownCard, { top: menuPos.top, right: menuPos.right }]}>

            <TouchableOpacity
              activeOpacity={0.75}
              style={phoneStyles.dropdownItem}
              onPress={() => {
                setMenuVisible(false);
                onEdit();
              }}>
              <View style={phoneStyles.dropdownIconBadge}>
                <Pencil size={14} color="#2563EB" />
              </View>
              <Text style={[phoneStyles.dropdownItemText, { color: '#1E293B' }]}>Update</Text>
            </TouchableOpacity>

            <View style={phoneStyles.dropdownDivider} />

            <TouchableOpacity
              activeOpacity={0.75}
              style={phoneStyles.dropdownItem}
              onPress={() => {
                setMenuVisible(false);
                onDelete();
              }}>
              <View style={[phoneStyles.dropdownIconBadge, { backgroundColor: '#FEF2F2' }]}>
                <Trash2 size={14} color="#EF4444" />
              </View>
              <Text style={[phoneStyles.dropdownItemText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>

          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: { fontSize: 24, fontWeight: '700' },
  headerAddBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  headerAddBtnLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    height: 46,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  filterBtn: { padding: 4 },
  list: { paddingHorizontal: Spacing.three, paddingBottom: 100, gap: Spacing.three },
  emptyState: { alignItems: 'center', gap: Spacing.two, paddingTop: 80 },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    zIndex: 100,
  },
  fabIcon: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalForm: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 40 },
  previewCard: {
    borderRadius: 16,
    padding: Spacing.three,
    alignItems: 'center',
    gap: 4,
  },
  previewName: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  previewPrice: { color: '#D97706', fontSize: 18, fontWeight: '700', marginTop: 2 },
  field: { gap: 4 },
  horizontalUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  horizontalUploadLabel: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
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
});

const phoneStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.three,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    gap: Spacing.two,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  imageWrap: {
    width: 90,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadedImage: {
    width: 90,
    height: 90,
    borderRadius: 14,
  },
  inStockBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 10,
  },
  inStockText: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '700',
  },
  phoneFrame: {
    width: 60,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    padding: 3,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cameraNotch: {
    position: 'absolute',
    top: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0F172A',
  },
  screenWallpaper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  menuBtn: {
    paddingLeft: 8,
    paddingBottom: 4,
  },
  subSpecs: {
    fontSize: 13,
    marginTop: 1,
  },
  priceText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#D97706',
    marginTop: 3,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  specsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  specCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  specValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  extraSpecsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  extraTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewDetailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  viewDetailsLabel: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  /* Floating Dropdown */
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  dropdownCaret: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#E2EAF4',
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  dropdownCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minWidth: 125,
    borderWidth: 1,
    borderColor: '#E2EAF4',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#EEF2F9',
  },
});
