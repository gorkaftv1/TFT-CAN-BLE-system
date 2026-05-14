import React from 'react';
import {
  ActivityIndicator, SectionList, SectionListRenderItem,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUdsStore } from '../../stores/udsStore';
import { UdsDidConfig, EXTENDED_DIDS, STANDARD_DIDS, UDS_SESSION_EXTENDED } from '../../config/uds_dids';
import { colors, fontSize, spacing } from '../../shared/theme';

type Section = { title: string; locked: boolean; data: UdsDidConfig[] };

function SessionBar() {
  const { sessionType, sessionLoading, openExtendedSession, closeToDefaultSession } = useUdsStore();
  const isExtended = sessionType === UDS_SESSION_EXTENDED;

  return (
    <View style={styles.sessionBar}>
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionLabel}>Session</Text>
        <View style={[styles.sessionBadge, { backgroundColor: isExtended ? colors.warning + '33' : colors.primary + '22' }]}>
          <Text style={[styles.sessionBadgeText, { color: isExtended ? colors.warning : colors.primary }]}>
            {isExtended ? 'EXTENDED' : 'DEFAULT'}
          </Text>
        </View>
      </View>
      {sessionLoading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : isExtended ? (
        <TouchableOpacity style={styles.btnClose} onPress={closeToDefaultSession} activeOpacity={0.75}>
          <Text style={styles.btnCloseLabel}>→ Default</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.btnExtend} onPress={openExtendedSession} activeOpacity={0.75}>
          <Text style={styles.btnExtendLabel}>Open Extended</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function DidRow({ item, locked }: { item: UdsDidConfig; locked: boolean }) {
  const { didValues, readingDid, readDid } = useUdsStore();
  const entry   = didValues[item.hexStr];
  const reading = readingDid === item.hexStr;

  const displayValue = entry == null
    ? '—'
    : typeof entry.value === 'number'
      ? String(entry.value)
      : entry.value;

  return (
    <View style={[styles.didRow, locked && styles.didRowLocked]}>
      <View style={styles.didHexBadge}>
        <Text style={[styles.didHex, locked && styles.textLocked]}>{item.hexStr}</Text>
      </View>
      <View style={styles.didMeta}>
        <Text style={[styles.didName, locked && styles.textLocked]} numberOfLines={1}>{item.name}</Text>
        {entry !== undefined && !locked && (
          <Text style={styles.didValue}>
            {displayValue}{entry && entry.unit ? ` ${entry.unit}` : ''}
          </Text>
        )}
      </View>
      <View style={styles.didRight}>
        {locked ? (
          <Text style={styles.lockIcon}>🔒</Text>
        ) : reading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <TouchableOpacity
            style={styles.btnRead}
            onPress={() => readDid(item.hexStr)}
            activeOpacity={0.75}
          >
            <Text style={styles.btnReadLabel}>Read</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SectionHeader({ title, locked }: { title: string; locked: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {locked && <Text style={styles.sectionLockHint}>requires Extended session</Text>}
    </View>
  );
}

export function UdsScreen() {
  const { status } = useConnectionStore();
  const { readAllAvailable, readAllLoading, error } = useUdsStore();
  const { sessionType } = useUdsStore();

  const isExtended = sessionType === UDS_SESSION_EXTENDED;

  if (status !== 'connected') {
    return (
      <View style={styles.centred}>
        <Text style={styles.notConnected}>Connect to a vehicle first</Text>
      </View>
    );
  }

  const sections: Section[] = [
    { title: 'Standard DIDs', locked: false, data: STANDARD_DIDS },
    { title: 'Extended Session DIDs', locked: !isExtended, data: EXTENDED_DIDS },
  ];

  const renderItem: SectionListRenderItem<UdsDidConfig, Section> = ({ item, section }) => (
    <DidRow item={item} locked={section.locked} />
  );

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <SectionHeader title={section.title} locked={section.locked} />
  );

  return (
    <View style={styles.root}>
      <SessionBar />

      <View style={styles.toolbar}>
        <Text style={styles.toolbarHint}>ISO 14229-1</Text>
        {readAllLoading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <TouchableOpacity style={styles.btnReadAll} onPress={readAllAvailable} activeOpacity={0.75}>
            <Text style={styles.btnReadAllLabel}>Read All</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.hexStr}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  notConnected: { color: colors.textMuted, fontSize: fontSize.sm },

  // Session bar
  sessionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sessionInfo:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sessionLabel:     { fontSize: fontSize.sm, color: colors.textSecondary },
  sessionBadge:     { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
  sessionBadgeText: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'monospace' },
  btnExtend:        { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, backgroundColor: colors.warning },
  btnExtendLabel:   { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },
  btnClose:         { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, borderWidth: 1, borderColor: colors.textSecondary },
  btnCloseLabel:    { fontSize: fontSize.sm, color: colors.textSecondary },

  // Toolbar
  toolbar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  toolbarHint:   { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: 'monospace' },
  btnReadAll:    { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 6, backgroundColor: colors.primary },
  btnReadAllLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.background },

  errorText: { fontSize: fontSize.sm, color: colors.error, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, textAlign: 'center' },

  // Section header
  sectionHeader:    { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle:     { fontSize: fontSize.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionLockHint:  { fontSize: fontSize.xs, color: colors.textMuted },

  // DID rows
  list:        { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  didRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.md, marginBottom: spacing.xs,
    backgroundColor: colors.surface, borderRadius: 10,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },
  didRowLocked: { opacity: 0.45 },
  didHexBadge:  { backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minWidth: 64, alignItems: 'center' },
  didHex:       { fontSize: fontSize.xs, fontFamily: 'monospace', color: colors.primary },
  didMeta:      { flex: 1 },
  didName:      { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  didValue:     { fontSize: fontSize.xs, color: colors.success, fontFamily: 'monospace', marginTop: 2 },
  didRight:     { alignItems: 'flex-end', minWidth: 56 },
  lockIcon:     { fontSize: fontSize.sm },
  textLocked:   { color: colors.textMuted },
  btnRead:      { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: colors.primary },
  btnReadLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
});
