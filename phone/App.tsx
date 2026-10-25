import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  CalendarSettings, createEntry, createLesson, createServiceTask, deleteEntry, Entry, EntryKind,
  getCalendar, getEntries, getLessons, getServiceTasks, Lesson, login, logout, Membership,
  migrate, register, restoreSession, saveCalendar, ServiceTask, setEntryDone, setServiceTaskStatus,
  updateSchool, User,
} from './src/database';

type Tab = 'home' | 'schedule' | 'services' | 'ai';
const tierName: Record<Membership, string> = { basic: '普通会员', plus: 'Plus 会员', pro: 'Pro 会员' };
const kindName: Record<EntryKind, string> = { course: '课程', assignment: '作业', exam: '考试', daily: '日常' };
const emptyCalendar = (): CalendarSettings => ({ summerDate: '', summerSource: '', holidays: [] });

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
}

function daysUntil(value: string) {
  const target = parseDay(value);
  if (!target) return null;
  const now = new Date();
  return Math.ceil((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86400000);
}

function countdown(value: string) {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days === 0) return '今天';
  if (days < 0) return '已结束';
  return `${days} 天`;
}

function nextEntry(entries: Entry[], kind: EntryKind) {
  return entries.filter(item => item.kind === kind && !item.done && item.date && (daysUntil(item.date) ?? -1) >= 0)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (text: string) => void; placeholder?: string;
  secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address'; multiline?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    style={[styles.input, multiline && styles.textarea]} value={value} onChangeText={onChangeText}
    placeholder={placeholder} placeholderTextColor="#716987" secureTextEntry={secureTextEntry}
    keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
    multiline={multiline}
  /></View>;
}

function Sheet({ visible, title, children, onClose }: { visible: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView></View>
    </KeyboardAvoidingView>
  </Modal>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const db = useSQLiteContext();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(''); const [school, setSchool] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try { onAuthenticated(mode === 'login' ? await login(db, email, password) : await register(db, name, school, email, password)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  };
  return <LinearGradient colors={['#8875ef', '#41358f', '#15152d']} style={styles.flex}>
    <SafeAreaView style={styles.authSafe}><View style={styles.authBrand}><Text style={styles.authMark}>▱</Text><Text style={styles.authBrandTitle}>留学手记</Text><Text style={styles.lettered}>STUDY JOURNAL</Text></View>
      <View style={styles.authPanel}><Text style={styles.eyebrow}>YOUR STORY STARTS HERE</Text><Text style={styles.authTitle}>{mode === 'login' ? '欢迎回来' : '创建你的手记'}</Text><Text style={styles.muted}>{mode === 'login' ? '登录，继续记录留学生活。' : '所有资料只保存在这台手机。'}</Text>
        <View style={styles.segment}>{(['login', 'register'] as const).map(item => <Pressable key={item} style={[styles.segmentButton, mode === item && styles.segmentActive]} onPress={() => { setMode(item); setError(''); }}><Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'login' ? '登录' : '注册'}</Text></Pressable>)}</View>
        {mode === 'register' && <><Field label="昵称" value={name} onChangeText={setName} placeholder="我们该怎么称呼你？" /><Field label="学校英文名" value={school} onChangeText={setSchool} placeholder="University of Zurich" /></>}
        <Field label="邮箱" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
        <Field label="密码" value={password} onChangeText={setPassword} placeholder="至少 8 个字符" secureTextEntry />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.primaryButtonText}>{busy ? '请稍候…' : mode === 'login' ? '登录我的手记  ↗' : '创建账号  ↗'}</Text></Pressable>
      </View>
    </SafeAreaView>
  </LinearGradient>;
}

function Header({ user, title, onProfile }: { user: User; title: string; onProfile: () => void }) {
  return <View style={styles.header}><Pressable style={styles.avatar} onPress={onProfile}><Text style={styles.avatarText}>{user.name.trim().charAt(0).toUpperCase()}</Text></Pressable><View><Text style={styles.headerTitle}>{title}</Text><Text style={styles.lettered}>STUDY JOURNAL</Text></View><View style={styles.headerSpacer} /></View>;
}

function MeteorBelt() {
  const travel = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(travel, { toValue: 1, duration: 3200, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [travel]);
  const translateX = travel.interpolate({ inputRange: [0, 1], outputRange: [-90, 115] });
  const shimmer = travel.interpolate({ inputRange: [0, .25, .62, 1], outputRange: [.2, 1, .45, .2] });
  return <View pointerEvents="none" style={styles.meteorBelt} accessibilityElementsHidden>
    <View style={[styles.starDust, styles.starOne]} /><View style={[styles.starDust, styles.starTwo]} /><View style={[styles.starDust, styles.starThree]} /><View style={[styles.starDust, styles.starFour]} />
    <Animated.View style={[styles.meteorStream, { opacity: shimmer, transform: [{ translateX }, { rotate: '-10deg' }] }]}>
      <LinearGradient colors={['#ffffff00', '#c9d5ff55', '#ffffffee']} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={styles.meteorTrailLong} />
      <View style={[styles.meteorHead, styles.meteorHeadLarge]} />
    </Animated.View>
    <Animated.View style={[styles.meteorStream, styles.meteorStreamSmall, { opacity: shimmer, transform: [{ translateX }, { rotate: '-10deg' }] }]}>
      <LinearGradient colors={['#ffffff00', '#d8c9ff66', '#ffffffdd']} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={styles.meteorTrailShort} />
      <View style={styles.meteorHead} />
    </Animated.View>
    <Animated.Text style={[styles.meteorSpark, { opacity: shimmer }]}>✦</Animated.Text>
  </View>;
}

function MembershipCard({ user }: { user: User }) {
  const [flipped, setFlipped] = useState(false); const rotation = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const player = useAudioPlayer(require('./assets/card-flip.wav'));
  const turn = () => {
    const next = !flipped; setFlipped(next);
    Animated.parallel([
      Animated.spring(rotation, { toValue: next ? 1 : 0, friction: 8, tension: 70, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
    ]).start();
    try { player.seekTo(0); player.play(); } catch (_) {}
    Haptics.selectionAsync().catch(() => undefined);
  };
  const front = { transform: [{ perspective: 900 }, { rotateY: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] };
  const back = { transform: [{ perspective: 900 }, { rotateY: rotation.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }] };
  return <View><View style={styles.cardStage}>
    <Animated.View pointerEvents="none" style={[styles.cardGlow, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) }] }]} />
    <Animated.View style={[styles.memberCard, front]}><Pressable style={styles.cardPressable} onPress={turn} accessibilityRole="button" accessibilityLabel="翻转会员卡"><View style={styles.cardTop}><View style={styles.schoolBlock}><Text style={styles.cardSchool} numberOfLines={2} adjustsFontSizeToFit>{(user.school || 'ADD YOUR SCHOOL').toUpperCase()}</Text><Text style={styles.cardMini}>INTERNATIONAL STUDENT</Text></View><Text style={styles.cardCode}>{user.membership.toUpperCase()} MEMBER</Text></View><MeteorBelt /><View style={styles.cardBottom}><View><Text style={styles.cardMini}>CARDHOLDER</Text><Text style={styles.cardOwner}>{user.name.toUpperCase()}</Text></View><View style={styles.cardRight}><Text style={styles.cardMini}>MEMBERSHIP</Text><Text style={styles.cardSince}>{tierName[user.membership]}</Text></View></View></Pressable></Animated.View>
    <Animated.View style={[styles.memberCard, styles.memberCardBack, back]}><Pressable style={styles.cardPressable} onPress={turn} accessibilityRole="button" accessibilityLabel="翻回会员卡正面"><Text style={styles.backTitle}>你的会员权益</Text><View style={styles.benefits}><Text style={styles.benefit}>▤ 课程、作业与考试安排</Text><Text style={styles.benefit}>✓ 学生服务待办与课表</Text><Text style={styles.benefit}>◇ 个人记录独立保存</Text><Text style={styles.benefit}>✦ AI 助手界面</Text></View></Pressable></Animated.View>
  </View></View>;
}

function HomeScreen({ user, onProfile }: { user: User; onProfile: () => void }) {
  return <LinearGradient colors={['#8f7cf4', '#493a9f', '#211d53', '#14142d']} style={styles.screen}><SafeAreaView style={styles.screenSafe}><Header user={user} title="留学手记" onProfile={onProfile} /><ScrollView contentContainerStyle={styles.homeBody} showsVerticalScrollIndicator={false}><Text style={styles.homeLabel}>MEMBERSHIP</Text><Text style={styles.homeTier}>{tierName[user.membership]}</Text><MembershipCard user={user} /></ScrollView></SafeAreaView></LinearGradient>;
}

function EntrySheet({ visible, onClose, onSaved, user }: { visible: boolean; onClose: () => void; onSaved: () => void; user: User }) {
  const db = useSQLiteContext(); const [kind, setKind] = useState<EntryKind>('assignment'); const [title, setTitle] = useState(''); const [date, setDate] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [location, setLocation] = useState(''); const [notes, setNotes] = useState('');
  const save = async () => { try { if (date && !parseDay(date)) throw new Error('日期格式应为 YYYY-MM-DD'); await createEntry(db, user.id, { kind, title, date, start, end, location, notes }); setTitle(''); setDate(''); setStart(''); setEnd(''); setLocation(''); setNotes(''); onSaved(); onClose(); } catch (error) { Alert.alert('无法保存', error instanceof Error ? error.message : '请检查内容'); } };
  return <Sheet visible={visible} title="新增事项" onClose={onClose}><Text style={styles.fieldLabel}>类型</Text><View style={styles.chips}>{(['assignment', 'exam', 'course', 'daily'] as EntryKind[]).map(item => <Pressable key={item} style={[styles.chip, kind === item && styles.chipActive]} onPress={() => setKind(item)}><Text style={[styles.chipText, kind === item && styles.chipTextActive]}>{kindName[item]}</Text></Pressable>)}</View><Field label="标题" value={title} onChangeText={setTitle} placeholder="例如：提交研究报告" /><Field label="日期" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /><View style={styles.twoColumns}><View style={styles.column}><Field label="开始时间" value={start} onChangeText={setStart} placeholder="09:00" /></View><View style={styles.column}><Field label="结束时间" value={end} onChangeText={setEnd} placeholder="10:30" /></View></View><Field label="地点" value={location} onChangeText={setLocation} placeholder="教室或线上" /><Field label="备注" value={notes} onChangeText={setNotes} multiline /><Pressable style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>保存事项</Text></Pressable></Sheet>;
}

function CalendarSheet({ visible, value, onClose, onSaved, user }: { visible: boolean; value: CalendarSettings; onClose: () => void; onSaved: () => void; user: User }) {
  const db = useSQLiteContext(); const [summerDate, setSummerDate] = useState(''); const [summerSource, setSummerSource] = useState(''); const [holidayName, setHolidayName] = useState(''); const [holidayDate, setHolidayDate] = useState(''); const [holidaySource, setHolidaySource] = useState(''); const [holidays, setHolidays] = useState(value.holidays);
  useEffect(() => { if (visible) { setSummerDate(value.summerDate); setSummerSource(value.summerSource); setHolidays(value.holidays); setHolidayName(''); setHolidayDate(''); setHolidaySource(''); } }, [visible, value]);
  const save = async () => { try { const additions = holidayName || holidayDate || holidaySource; if (summerDate && !parseDay(summerDate)) throw new Error('暑假日期格式应为 YYYY-MM-DD'); if (additions && (!holidayName.trim() || !parseDay(holidayDate) || !holidaySource.trim())) throw new Error('请完整填写其他假期名称、日期和来源'); const next = additions ? [...holidays, { name: holidayName.trim(), date: holidayDate, source: holidaySource.trim() }] : holidays; await saveCalendar(db, user.id, { summerDate, summerSource, holidays: next }); onSaved(); onClose(); } catch (error) { Alert.alert('无法保存', error instanceof Error ? error.message : '请检查内容'); } };
  return <Sheet visible={visible} title="假期与校历" onClose={onClose}><Text style={styles.sheetNote}>请以学校确认的校历为准。日期和来源保存在手机 SQLite 数据库。</Text>{holidays.map((item, index) => <View key={`${item.name}-${index}`} style={styles.holidayRow}><View style={styles.flex}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{item.date} · {item.source}</Text></View><Pressable onPress={() => setHolidays(items => items.filter((_, i) => i !== index))}><Text style={styles.remove}>删除</Text></Pressable></View>)}<Field label="暑假开始日期" value={summerDate} onChangeText={setSummerDate} placeholder="YYYY-MM-DD" /><Field label="暑假日期来源" value={summerSource} onChangeText={setSummerSource} placeholder="学校官网 2027 校历" /><View style={styles.divider} /><Text style={styles.sectionLabel}>添加其他假期</Text><Field label="假期名称" value={holidayName} onChangeText={setHolidayName} placeholder="例如：春假" /><Field label="开始日期" value={holidayDate} onChangeText={setHolidayDate} placeholder="YYYY-MM-DD" /><Field label="日期来源" value={holidaySource} onChangeText={setHolidaySource} placeholder="学校官网校历" /><Pressable style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>保存到数据库</Text></Pressable></Sheet>;
}

function ScheduleScreen({ user, onProfile }: { user: User; onProfile: () => void }) {
  const db = useSQLiteContext(); const [entries, setEntries] = useState<Entry[]>([]); const [calendar, setCalendar] = useState(emptyCalendar()); const [entryOpen, setEntryOpen] = useState(false); const [calendarOpen, setCalendarOpen] = useState(false);
  const refresh = async () => { setEntries(await getEntries(db, user.id)); setCalendar(await getCalendar(db, user.id)); };
  useEffect(() => { refresh().catch(error => Alert.alert('读取失败', String(error))); }, []);
  const assignment = nextEntry(entries, 'assignment'); const exam = nextEntry(entries, 'exam');
  const toggle = async (item: Entry) => { await setEntryDone(db, user.id, item.id, !item.done); await refresh(); };
  const remove = (item: Entry) => Alert.alert('删除事项？', item.title, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { await deleteEntry(db, user.id, item.id); await refresh(); } }]);
  return <View style={styles.screen}><SafeAreaView style={styles.screenSafe}><Header user={user} title="重要的事" onProfile={onProfile} /><ScrollView contentContainerStyle={styles.pageBody} showsVerticalScrollIndicator={false}><View style={styles.pageHeading}><View><Text style={styles.eyebrow}>WHAT MATTERS NEXT</Text><Text style={styles.pageTitle}>重要的事</Text></View><Pressable style={styles.addButton} onPress={() => setEntryOpen(true)}><Text style={styles.addButtonText}>＋</Text></Pressable></View>
    <Pressable onPress={() => setCalendarOpen(true)}><LinearGradient colors={['#725cda', '#3d317f']} style={styles.importantCard}><Text style={styles.importantIcon}>☀</Text><Text style={styles.importantLabel}>距离暑假还有</Text><Text style={styles.importantValue}>{calendar.summerDate ? countdown(calendar.summerDate) : '待设置'}</Text><Text style={styles.importantMeta}>{calendar.summerSource || '请按校历确认日期'}</Text><Text style={styles.cardLink}>查看其他假期 ↗</Text></LinearGradient></Pressable>
    <View style={styles.importantPair}><LinearGradient colors={['#31556d', '#252c58']} style={[styles.importantCard, styles.halfCard]}><Text style={styles.importantIcon}>✓</Text><Text style={styles.importantLabel}>作业截止</Text><Text style={styles.importantValueSmall}>{assignment ? countdown(assignment.date) : '—'}</Text><Text style={styles.importantMeta}>{assignment?.title || '暂无待交作业'}</Text></LinearGradient><LinearGradient colors={['#62427c', '#302753']} style={[styles.importantCard, styles.halfCard]}><Text style={styles.importantIcon}>◷</Text><Text style={styles.importantLabel}>距离考试</Text><Text style={styles.importantValueSmall}>{exam ? countdown(exam.date) : '—'}</Text><Text style={styles.importantMeta}>{exam?.title || '暂无考试安排'}</Text></LinearGradient></View>
    <Text style={styles.sectionLabel}>全部事项</Text>{entries.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>◇</Text><Text style={styles.muted}>还没有事项，点击右上角添加。</Text></View> : entries.map(item => <Pressable key={item.id} style={[styles.listCard, item.done ? styles.doneCard : undefined]} onPress={() => toggle(item)} onLongPress={() => remove(item)}><View style={[styles.kindDot, { backgroundColor: item.kind === 'exam' ? '#d996da' : item.kind === 'assignment' ? '#78d8cc' : '#9d8df1' }]} /><View style={styles.flex}><Text style={[styles.rowTitle, item.done ? styles.doneText : undefined]}>{item.title}</Text><Text style={styles.rowMeta}>{kindName[item.kind]} · {item.date || '日期待定'} {item.start}</Text></View><Text style={styles.check}>{item.done ? '✓' : '○'}</Text></Pressable>)}<Text style={styles.longPressHint}>点击完成 · 长按删除</Text></ScrollView></SafeAreaView><EntrySheet visible={entryOpen} onClose={() => setEntryOpen(false)} onSaved={refresh} user={user} /><CalendarSheet visible={calendarOpen} value={calendar} onClose={() => setCalendarOpen(false)} onSaved={refresh} user={user} /></View>;
}

function TaskSheet({ visible, onClose, onSaved, user }: { visible: boolean; onClose: () => void; onSaved: () => void; user: User }) {
  const db = useSQLiteContext(); const [title, setTitle] = useState(''); const [due, setDue] = useState(''); const [instructions, setInstructions] = useState(''); const [important, setImportant] = useState(false);
  const save = async () => { try { if (due && !parseDay(due)) throw new Error('日期格式应为 YYYY-MM-DD'); await createServiceTask(db, user.id, title, due, instructions, important); setTitle(''); setDue(''); setInstructions(''); setImportant(false); onSaved(); onClose(); } catch (error) { Alert.alert('无法保存', error instanceof Error ? error.message : '请检查内容'); } };
  return <Sheet visible={visible} title="新增学生待办" onClose={onClose}><Field label="待办标题" value={title} onChangeText={setTitle} /><Field label="截止日期" value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" /><Field label="说明" value={instructions} onChangeText={setInstructions} multiline /><Pressable style={styles.toggleRow} onPress={() => setImportant(!important)}><Text style={styles.rowTitle}>标记为重要</Text><Text style={styles.check}>{important ? '●' : '○'}</Text></Pressable><Pressable style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>保存待办</Text></Pressable></Sheet>;
}

function LessonSheet({ visible, onClose, onSaved, user }: { visible: boolean; onClose: () => void; onSaved: () => void; user: User }) {
  const db = useSQLiteContext(); const [subject, setSubject] = useState(''); const [starts, setStarts] = useState(''); const [ends, setEnds] = useState(''); const [location, setLocation] = useState('');
  const save = async () => { try { await createLesson(db, user.id, subject, starts, ends, location); setSubject(''); setStarts(''); setEnds(''); setLocation(''); onSaved(); onClose(); } catch (error) { Alert.alert('无法保存', error instanceof Error ? error.message : '请检查内容'); } };
  return <Sheet visible={visible} title="新增课程" onClose={onClose}><Field label="课程名称" value={subject} onChangeText={setSubject} /><Field label="开始时间" value={starts} onChangeText={setStarts} placeholder="2027-01-20 09:00" /><Field label="结束时间" value={ends} onChangeText={setEnds} placeholder="2027-01-20 10:30" /><Field label="地点" value={location} onChangeText={setLocation} /><Pressable style={styles.primaryButton} onPress={save}><Text style={styles.primaryButtonText}>保存课程</Text></Pressable></Sheet>;
}

function ServicesScreen({ user, onProfile }: { user: User; onProfile: () => void }) {
  const db = useSQLiteContext(); const [tasks, setTasks] = useState<ServiceTask[]>([]); const [lessons, setLessons] = useState<Lesson[]>([]); const [mode, setMode] = useState<'tasks' | 'lessons'>('tasks'); const [taskOpen, setTaskOpen] = useState(false); const [lessonOpen, setLessonOpen] = useState(false);
  const refresh = async () => { setTasks(await getServiceTasks(db, user.id)); setLessons(await getLessons(db, user.id)); };
  useEffect(() => { refresh().catch(error => Alert.alert('读取失败', String(error))); }, []);
  const advance = async (task: ServiceTask) => { const status = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'todo'; await setServiceTaskStatus(db, user.id, task.id, status); await refresh(); };
  return <View style={styles.screen}><SafeAreaView style={styles.screenSafe}><Header user={user} title="学生服务" onProfile={onProfile} /><ScrollView contentContainerStyle={styles.pageBody}><View style={styles.pageHeading}><View><Text style={styles.eyebrow}>STUDENT SERVICES</Text><Text style={styles.pageTitle}>我的服务</Text></View><Pressable style={styles.addButton} onPress={() => mode === 'tasks' ? setTaskOpen(true) : setLessonOpen(true)}><Text style={styles.addButtonText}>＋</Text></Pressable></View><View style={styles.segment}>{(['tasks', 'lessons'] as const).map(item => <Pressable key={item} style={[styles.segmentButton, mode === item && styles.segmentActive]} onPress={() => setMode(item)}><Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'tasks' ? '待办' : '课表'}</Text></Pressable>)}</View>
    {mode === 'tasks' ? (tasks.length ? tasks.map(task => <Pressable key={task.id} style={[styles.serviceCard, task.status === 'completed' && styles.doneCard]} onPress={() => advance(task)}><View style={styles.serviceTop}><Text style={styles.priority}>{task.important ? '重要' : '待办'}</Text><Text style={styles.rowMeta}>{task.due_on ? `截止 ${task.due_on}` : '无截止日期'}</Text></View><Text style={[styles.rowTitle, task.status === 'completed' && styles.doneText]}>{task.title}</Text>{!!task.instructions && <Text style={styles.instructions}>{task.instructions}</Text>}<Text style={styles.statusText}>{task.status === 'todo' ? '待开始' : task.status === 'in_progress' ? '进行中' : '已完成'} · 点击切换状态</Text></Pressable>) : <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.muted}>暂无学生服务待办</Text></View>) : (lessons.length ? lessons.map(lesson => <View key={lesson.id} style={styles.serviceCard}><View style={styles.serviceTop}><Text style={styles.priority}>课程</Text><Text style={styles.rowMeta}>{lesson.status === 'scheduled' ? '已安排' : lesson.status}</Text></View><Text style={styles.rowTitle}>{lesson.subject}</Text><Text style={styles.instructions}>{lesson.starts_at}{lesson.ends_at ? ` — ${lesson.ends_at}` : ''}</Text><Text style={styles.statusText}>{lesson.location || '地点待定'}</Text></View>) : <View style={styles.empty}><Text style={styles.emptyIcon}>▦</Text><Text style={styles.muted}>暂无课程安排</Text></View>)}</ScrollView></SafeAreaView><TaskSheet visible={taskOpen} onClose={() => setTaskOpen(false)} onSaved={refresh} user={user} /><LessonSheet visible={lessonOpen} onClose={() => setLessonOpen(false)} onSaved={refresh} user={user} /></View>;
}

function AiScreen({ user, onProfile }: { user: User; onProfile: () => void }) {
  const [draft, setDraft] = useState('');
  return <View style={styles.screen}><SafeAreaView style={styles.screenSafe}><Header user={user} title="AI 助手" onProfile={onProfile} /><View style={styles.aiBody}><View style={styles.aiStatus}><Text style={styles.aiStar}>✦</Text><View><Text style={styles.rowTitle}>AI 助手</Text><Text style={styles.rowMeta}>界面预览 · 暂未接入 AI 服务</Text></View></View><ScrollView contentContainerStyle={styles.messages}><View style={styles.assistantMessage}><Text style={styles.messageText}>你好，我是你的留学助手。以后可以帮你整理课程、作业和考试安排。</Text></View><View style={styles.userMessage}><Text style={styles.messageText}>我这周最需要关注什么？</Text></View><View style={styles.assistantMessage}><Text style={styles.messageText}>你可以先确认最近的作业截止时间，再为下一场考试留出复习时间。</Text></View></ScrollView><View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="输入消息…" placeholderTextColor="#79708c" style={styles.composerInput} /><Pressable style={styles.send} onPress={() => Alert.alert('暂未接入', '当前只展示对话界面，不会发送你的文字。')}><Text style={styles.sendText}>↑</Text></Pressable></View></View></SafeAreaView></View>;
}

function ProfileSheet({ visible, user, onClose, onLogout, onUserChange }: { visible: boolean; user: User; onClose: () => void; onLogout: () => void; onUserChange: (user: User) => void }) {
  const db = useSQLiteContext(); const [school, setSchool] = useState(user.school);
  useEffect(() => { if (visible) setSchool(user.school); }, [visible, user.school]);
  const saveSchool = async () => { try { onUserChange(await updateSchool(db, user, school)); Alert.alert('已保存', '会员卡上的学校名称已经更新。'); } catch (error) { Alert.alert('无法保存', error instanceof Error ? error.message : '请检查学校名称'); } };
  return <Sheet visible={visible} title="个人信息" onClose={onClose}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user.name.trim().charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{user.name}</Text><Text style={[styles.muted, styles.center]}>{user.email}</Text><View style={styles.profileDetails}><Field label="学校英文名" value={school} onChangeText={setSchool} placeholder="University of Zurich" /><Pressable style={styles.schoolSaveButton} onPress={saveSchool}><Text style={styles.schoolSaveText}>保存学校信息</Text></Pressable><View style={styles.detailRow}><Text style={styles.rowMeta}>会员等级</Text><Text style={styles.rowTitle}>{tierName[user.membership]}</Text></View><View style={styles.detailRow}><Text style={styles.rowMeta}>数据保存</Text><Text style={styles.rowTitle}>手机 SQLite</Text></View><View style={styles.detailRow}><Text style={styles.rowMeta}>账号状态</Text><Text style={styles.rowTitle}>本机可用</Text></View></View><Pressable style={styles.logoutButton} onPress={onLogout}><Text style={styles.logoutText}>退出登录</Text></Pressable></Sheet>;
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items: { key: Tab; icon: string; label: string }[] = [{ key: 'home', icon: '⌂', label: '首页' }, { key: 'schedule', icon: '▦', label: '日程' }, { key: 'services', icon: '✓', label: '服务' }, { key: 'ai', icon: '✦', label: 'AI 助手' }];
  return <View style={styles.nav}>{items.map(item => <Pressable key={item.key} style={[styles.navItem, tab === item.key && styles.navActive]} onPress={() => onChange(item.key)}><Text style={[styles.navIcon, tab === item.key && styles.navTextActive]}>{item.icon}</Text><Text style={[styles.navLabel, tab === item.key && styles.navTextActive]}>{item.label}</Text></Pressable>)}</View>;
}

function MainApp({ user, onLogout, onUserChange }: { user: User; onLogout: () => void; onUserChange: (user: User) => void }) {
  const [tab, setTab] = useState<Tab>('home'); const [profile, setProfile] = useState(false);
  const screen = useMemo(() => tab === 'home' ? <HomeScreen user={user} onProfile={() => setProfile(true)} /> : tab === 'schedule' ? <ScheduleScreen user={user} onProfile={() => setProfile(true)} /> : tab === 'services' ? <ServicesScreen user={user} onProfile={() => setProfile(true)} /> : <AiScreen user={user} onProfile={() => setProfile(true)} />, [tab, user]);
  return <View style={styles.flex}>{screen}<BottomNav tab={tab} onChange={setTab} /><ProfileSheet visible={profile} user={user} onClose={() => setProfile(false)} onUserChange={onUserChange} onLogout={async () => { await logout(); setProfile(false); onLogout(); }} /></View>;
}

function Root() {
  const db = useSQLiteContext(); const [ready, setReady] = useState(false); const [user, setUser] = useState<User | null>(null);
  useEffect(() => { restoreSession(db).then(setUser).catch(error => Alert.alert('数据库错误', String(error))).finally(() => setReady(true)); }, []);
  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#cfc2ff" size="large" /><Text style={styles.muted}>正在打开留学手记…</Text></View>;
  return user ? <MainApp user={user} onUserChange={setUser} onLogout={() => setUser(null)} /> : <AuthScreen onAuthenticated={setUser} />;
}

export default function App() {
  return <SafeAreaProvider><StatusBar style="light" /><SQLiteProvider databaseName="studyaboard.sqlite3" onInit={migrate}><Root /></SQLiteProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: '#121226' }, screenSafe: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#121226' },
  authSafe: { flex: 1, justifyContent: 'space-between', padding: 24 }, authBrand: { alignItems: 'center', paddingTop: 36 }, authMark: { color: '#fff', fontSize: 38 }, authBrandTitle: { color: '#fff', fontSize: 27, fontWeight: '600', letterSpacing: 3, marginTop: 10 }, lettered: { color: '#d8cdf0aa', fontSize: 7, letterSpacing: 3, marginTop: 5 }, authPanel: { backgroundColor: '#17162dd9', borderColor: '#cdbfff35', borderWidth: 1, borderRadius: 28, padding: 24, marginBottom: 14 }, eyebrow: { color: '#b9a9d5', fontSize: 9, letterSpacing: 2.2, marginBottom: 9 }, authTitle: { color: '#fff', fontSize: 28, fontWeight: '600', marginBottom: 7 }, muted: { color: '#a8a0ba', fontSize: 12, lineHeight: 18 }, error: { color: '#ffb6c0', fontSize: 12, marginBottom: 12 }, disabled: { opacity: .55 },
  segment: { flexDirection: 'row', backgroundColor: '#ffffff0b', borderRadius: 14, padding: 4, marginVertical: 20 }, segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 }, segmentActive: { backgroundColor: '#b7a5ff25' }, segmentText: { color: '#9189a5', fontSize: 12 }, segmentTextActive: { color: '#fff', fontWeight: '600' },
  field: { marginBottom: 14 }, fieldLabel: { color: '#c9c0d9', fontSize: 11, marginBottom: 7 }, input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#c9b8f329', backgroundColor: '#ffffff0b', color: '#fff', paddingHorizontal: 14, fontSize: 15 }, textarea: { minHeight: 86, paddingTop: 13, textAlignVertical: 'top' }, primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#d5cbff', alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 }, primaryButtonText: { color: '#282047', fontSize: 14, fontWeight: '700' },
  header: { height: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 }, avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#ffffff38', backgroundColor: '#ffffff12', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 15 }, headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: 2, textAlign: 'center' }, headerSpacer: { width: 42 },
  homeBody: { alignItems: 'center', padding: 20, paddingTop: 36, paddingBottom: 130 }, homeLabel: { color: '#dacff0a8', fontSize: 11, letterSpacing: 3 }, homeTier: { color: '#fff', fontSize: 38, fontWeight: '600', marginTop: 16, marginBottom: 44 }, cardStage: { width: '100%', aspectRatio: 1.53 }, cardGlow: { position: 'absolute', top: -8, right: -8, bottom: -8, left: -8, borderRadius: 28, backgroundColor: '#d7cbff55', shadowColor: '#d7cbff', shadowOpacity: .8, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 10 }, memberCard: { position: 'absolute', width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', backgroundColor: '#eef1fa', borderColor: '#fff', borderWidth: 1, backfaceVisibility: 'hidden', shadowColor: '#060617', shadowOpacity: .35, shadowRadius: 18, shadowOffset: { width: 0, height: 14 }, elevation: 12 }, memberCardBack: { backgroundColor: '#dcd6f1' }, cardPressable: { flex: 1, padding: 24, justifyContent: 'space-between' }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 }, schoolBlock: { maxWidth: '72%' }, cardSchool: { color: '#5d647a', fontSize: 14, lineHeight: 17, fontWeight: '700', letterSpacing: .8 }, cardMini: { color: '#858ba0', fontSize: 6, letterSpacing: 2, marginTop: 5 }, cardCode: { color: '#747c93', fontSize: 7, letterSpacing: 1.5, marginTop: 5 }, meteorBelt: { position: 'absolute', left: 18, right: 18, top: '31%', height: 88, overflow: 'hidden', transform: [{ rotate: '-7deg' }] }, meteorStream: { position: 'absolute', left: 30, top: 28, width: 132, height: 10, flexDirection: 'row', alignItems: 'center' }, meteorStreamSmall: { top: 56, left: 82, transform: [{ scale: .72 }] }, meteorTrailLong: { width: 118, height: 3, borderRadius: 2 }, meteorTrailShort: { width: 82, height: 2, borderRadius: 2 }, meteorHead: { width: 6, height: 6, marginLeft: -2, borderRadius: 3, backgroundColor: '#fff', shadowColor: '#8fa7ff', shadowOpacity: 1, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 6 }, meteorHeadLarge: { width: 8, height: 8, borderRadius: 4 }, meteorSpark: { position: 'absolute', right: 58, top: 8, color: '#fff', fontSize: 16, textShadowColor: '#9eaaff', textShadowRadius: 9 }, starDust: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#fff', shadowColor: '#a7b2ff', shadowOpacity: .9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } }, starOne: { left: 42, top: 12 }, starTwo: { left: 116, top: 48, width: 2, height: 2 }, starThree: { right: 36, top: 66 }, starFour: { right: 98, top: 25, width: 4, height: 4 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 2 }, cardOwner: { color: '#5c647d', fontSize: 11, letterSpacing: 2, marginTop: 5 }, cardRight: { alignItems: 'flex-end' }, cardSince: { color: '#687087', fontSize: 9, marginTop: 5 }, backTitle: { color: '#4f4966', fontSize: 18, fontWeight: '700' }, benefits: { gap: 13 }, benefit: { color: '#5d5773', fontSize: 12 },
  pageBody: { padding: 20, paddingBottom: 125 }, pageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }, pageTitle: { color: '#fff', fontSize: 28, fontWeight: '600' }, addButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#d5cbff', alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#292048', fontSize: 26 }, importantCard: { minHeight: 180, padding: 20, borderRadius: 22, marginBottom: 12, overflow: 'hidden' }, importantPair: { flexDirection: 'row', gap: 12 }, halfCard: { flex: 1, minHeight: 170 }, importantIcon: { color: '#fff', fontSize: 20, marginBottom: 20 }, importantLabel: { color: '#dcd4ee', fontSize: 11 }, importantValue: { color: '#fff', fontSize: 34, fontWeight: '600', marginVertical: 6 }, importantValueSmall: { color: '#fff', fontSize: 27, fontWeight: '600', marginVertical: 6 }, importantMeta: { color: '#d0c7df', fontSize: 10, lineHeight: 15 }, cardLink: { color: '#f3ecff', fontSize: 10, marginTop: 13 }, sectionLabel: { color: '#e3dbf2', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 18, marginBottom: 12 }, listCard: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 14, backgroundColor: '#201d3b', borderRadius: 16, borderWidth: 1, borderColor: '#c4b3ff18', marginBottom: 9 }, doneCard: { opacity: .55 }, kindDot: { width: 4, height: 36, borderRadius: 3 }, rowTitle: { color: '#f1ecf8', fontSize: 14, fontWeight: '600' }, rowMeta: { color: '#968da8', fontSize: 10, marginTop: 4 }, doneText: { textDecorationLine: 'line-through' }, check: { color: '#cfc1ff', fontSize: 20 }, longPressHint: { color: '#706980', fontSize: 9, textAlign: 'center', marginTop: 8 }, empty: { alignItems: 'center', padding: 34, backgroundColor: '#1c1933', borderRadius: 18 }, emptyIcon: { color: '#a997e9', fontSize: 28, marginBottom: 10 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#070713a8' }, sheet: { maxHeight: '91%', backgroundColor: '#201d38', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: '#c5b3ff28', padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 24 }, sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff25', alignSelf: 'center', marginBottom: 18 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, sheetTitle: { color: '#fff', fontSize: 21, fontWeight: '600' }, close: { color: '#bcb2cb', fontSize: 29 }, sheetNote: { color: '#aa9fbf', fontSize: 11, lineHeight: 18, marginBottom: 16 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }, chip: { paddingHorizontal: 15, paddingVertical: 9, backgroundColor: '#ffffff0b', borderRadius: 18, borderWidth: 1, borderColor: '#ffffff10' }, chipActive: { backgroundColor: '#cdbfff25', borderColor: '#cdbfff55' }, chipText: { color: '#aaa2b8', fontSize: 11 }, chipTextActive: { color: '#fff' }, twoColumns: { flexDirection: 'row', gap: 10 }, column: { flex: 1 }, divider: { height: 1, backgroundColor: '#ffffff10', marginVertical: 12 }, holidayRow: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 13, backgroundColor: '#ffffff0a', marginBottom: 8 }, remove: { color: '#e6a8b7', fontSize: 11 },
  serviceCard: { padding: 17, backgroundColor: '#201d3b', borderRadius: 17, borderWidth: 1, borderColor: '#c4b3ff18', marginBottom: 10 }, serviceTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11 }, priority: { color: '#d7c9ff', fontSize: 9, letterSpacing: 1.3 }, instructions: { color: '#b5acc4', fontSize: 11, lineHeight: 18, marginTop: 8 }, statusText: { color: '#897e9d', fontSize: 9, marginTop: 11 }, toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, marginBottom: 10 },
  aiBody: { flex: 1, margin: 14, marginBottom: 105, borderRadius: 22, backgroundColor: '#19162f', borderWidth: 1, borderColor: '#d8ceff22', overflow: 'hidden' }, aiStatus: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 17, borderBottomWidth: 1, borderBottomColor: '#ffffff10' }, aiStar: { width: 34, height: 34, textAlign: 'center', textAlignVertical: 'center', borderRadius: 11, overflow: 'hidden', backgroundColor: '#7763d8', color: '#fff', fontSize: 15, lineHeight: 34 }, messages: { flexGrow: 1, padding: 18, gap: 18 }, assistantMessage: { alignSelf: 'flex-start', maxWidth: '85%', padding: 14, borderRadius: 17, borderTopLeftRadius: 5, backgroundColor: '#292447' }, userMessage: { alignSelf: 'flex-end', maxWidth: '82%', padding: 14, borderRadius: 17, borderTopRightRadius: 5, backgroundColor: '#7561d5' }, messageText: { color: '#f2edf9', fontSize: 13, lineHeight: 20 }, composer: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingLeft: 14, paddingRight: 7, borderRadius: 18, borderWidth: 1, borderColor: '#d5cbff35', backgroundColor: '#24203f' }, composerInput: { flex: 1, height: 48, color: '#fff', fontSize: 14 }, send: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#b9a8ff', alignItems: 'center', justifyContent: 'center' }, sendText: { color: '#20193d', fontSize: 20, fontWeight: '700' },
  profileAvatar: { width: 82, height: 82, borderRadius: 41, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ad9cff27', borderWidth: 1, borderColor: '#ffffff32', marginTop: 8 }, profileAvatarText: { color: '#fff', fontSize: 28 }, profileName: { color: '#fff', fontSize: 23, fontWeight: '600', textAlign: 'center', marginTop: 15, marginBottom: 5 }, center: { textAlign: 'center' }, profileDetails: { marginVertical: 25 }, schoolSaveButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#d5cbff20', borderWidth: 1, borderColor: '#d5cbff35', marginTop: -4, marginBottom: 14 }, schoolSaveText: { color: '#ded5ff', fontSize: 12, fontWeight: '600' }, detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, borderBottomWidth: 1, borderBottomColor: '#ffffff0c' }, logoutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, logoutText: { color: '#e9a7b7', fontSize: 13 },
  nav: { position: 'absolute', left: 16, right: 16, bottom: Platform.OS === 'ios' ? 18 : 12, minHeight: 70, padding: 6, flexDirection: 'row', borderRadius: 35, backgroundColor: '#17162eed', borderWidth: 1, borderColor: '#d0bfff30', shadowColor: '#080817', shadowOpacity: .4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 15 }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 29 }, navActive: { backgroundColor: '#d9c8ff25' }, navIcon: { color: '#9f96b0', fontSize: 20 }, navLabel: { color: '#9f96b0', fontSize: 9 }, navTextActive: { color: '#fff' },
});
