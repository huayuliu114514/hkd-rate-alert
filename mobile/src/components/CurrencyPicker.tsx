import { useDeferredValue, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Search, X } from 'lucide-react-native';

import { COLORS, CURRENCY_NAMES_ZH, FONTS } from '../constants';
import type { CurrencyMap } from '../types';

interface CurrencyPickerProps {
  currencies: CurrencyMap;
  onClose: () => void;
  onSelect: (code: string) => void;
  selectedCode: string;
  title: string;
  visible: boolean;
}

export function CurrencyPicker({
  currencies,
  onClose,
  onSelect,
  selectedCode,
  title,
  visible,
}: CurrencyPickerProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  function closePicker() {
    setQuery('');
    onClose();
  }

  function selectCurrency(code: string) {
    setQuery('');
    onSelect(code);
  }

  const codes = Object.keys(currencies).filter((code) => {
    const name = CURRENCY_NAMES_ZH[code] ?? currencies[code];
    return `${code} ${name}`.toLocaleLowerCase().includes(deferredQuery);
  });

  return (
    <Modal
      animationType="slide"
      onRequestClose={closePicker}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>CURRENCY</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable
            accessibilityLabel="关闭币种选择"
            hitSlop={8}
            onPress={closePicker}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <X color={COLORS.ink} size={22} strokeWidth={1.8} />
          </Pressable>
        </View>

        <View style={styles.searchField}>
          <Search color={COLORS.muted} size={18} strokeWidth={1.8} />
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="搜索代码或货币名称"
            placeholderTextColor={COLORS.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={codes}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(code) => code}
          ListEmptyComponent={<Text style={styles.emptyText}>没有匹配的货币</Text>}
          renderItem={({ item: code }) => {
            const selected = code === selectedCode;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => selectCurrency(code)}
                style={({ pressed }) => [
                  styles.currencyRow,
                  selected && styles.selectedRow,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.codeBadge}>
                  <Text style={styles.codeText}>{code}</Text>
                </View>
                <Text numberOfLines={1} style={styles.currencyName}>
                  {CURRENCY_NAMES_ZH[code] ?? currencies[code]}
                </Text>
                {selected ? (
                  <Check color={COLORS.teal} size={20} strokeWidth={2.2} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.line,
  },
  eyebrow: {
    color: COLORS.muted,
    fontFamily: FONTS.semibold,
    fontSize: 10,
  },
  title: {
    marginTop: 3,
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 22,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  searchField: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: COLORS.ink,
    fontFamily: FONTS.regular,
    fontSize: 15,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  currencyRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.line,
  },
  selectedRow: {
    backgroundColor: COLORS.tealSoft,
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderBottomColor: 'transparent',
    borderRadius: 6,
  },
  codeBadge: {
    width: 46,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    borderRadius: 4,
    backgroundColor: COLORS.surface,
  },
  codeText: {
    color: COLORS.ink,
    fontFamily: FONTS.semibold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  currencyName: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONTS.medium,
    fontSize: 15,
  },
  emptyText: {
    paddingTop: 48,
    color: COLORS.muted,
    fontFamily: FONTS.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.62,
  },
});