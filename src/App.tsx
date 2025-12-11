import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Settings, Plus, Activity, Calendar, Languages, Upload, Download, Trash2, Info, Github, Cloud } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { APP_VERSION } from './constants';
import { DoseEvent, Route, Ester, ExtraKey, SimulationResult, runSimulation, interpolateConcentration, encryptData, decryptData, getToE2Factor, SyncConfig, SyncData, syncToCloud, fetchFromCloud } from '../logic';
import { formatDate, formatTime, getRouteIcon } from './utils/helpers';
import { Lang } from './i18n/translations';
import ResultChart from './components/ResultChart';
import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal from './components/DoseFormModal';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import PasswordDisplayModal from './components/PasswordDisplayModal';
import PasswordInputModal from './components/PasswordInputModal';
import CustomSelect from './components/CustomSelect';
import CloudSyncModal from './components/CloudSyncModal';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();

    // Flag to prevent auto-sync during import
    const isImportingRef = React.useRef(false);
    // Debounce timer for sync
    const syncTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    // Flag to track if initial load is complete
    const initialLoadCompleteRef = React.useRef(false);

    const [events, setEvents] = useState<DoseEvent[]>(() => {
        const saved = localStorage.getItem('hrt-events');
        return saved ? JSON.parse(saved) : [];
    });
    const [weight, setWeight] = useState<number>(() => {
        const saved = localStorage.getItem('hrt-weight');
        return saved ? parseFloat(saved) : 70.0;
    });

    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<DoseEvent | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState("");
    const [isPasswordDisplayOpen, setIsPasswordDisplayOpen] = useState(false);
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
    const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);

    // Cloud sync configuration
    const [syncConfig, setSyncConfig] = useState(() => {
        const saved = localStorage.getItem('hrt-sync-config');
        return saved ? JSON.parse(saved) : {
            isEnabled: false,
            syncUrl: '',
            username: '',
            password: ''
        };
    });

    // Cloud sync status
    const [syncStatus, setSyncStatus] = useState<{
        isSyncing: boolean;
        lastSyncTime: Date | null;
        lastSyncError: string | null;
    }>({
        isSyncing: false,
        lastSyncTime: null,
        lastSyncError: null
    });

    // Track the last local modification time to avoid overwriting local changes
    const lastLocalModificationRef = React.useRef<string>(new Date().toISOString());

    const [currentView, setCurrentView] = useState<'home' | 'history' | 'settings'>('home');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const languageOptions = useMemo(() => ([
        { value: 'zh', label: '简体中文', icon: <span className="text-lg" role="img" aria-label="CN">🇨🇳</span> },
        { value: 'zh-TW', label: '正體中文', icon: <span className="text-lg" role="img" aria-label="TW">🤔</span> },
        { value: 'yue', label: '廣東話', icon: <span className="text-lg" role="img" aria-label="HK">🇭🇰</span> },
        { value: 'en', label: 'English', icon: <span className="text-lg" role="img" aria-label="US">🇺🇸</span> },
        { value: 'ru', label: 'Русский', icon: <span className="text-lg" role="img" aria-label="RU">🇷🇺</span> },
        { value: 'uk', label: 'Українська', icon: <span className="text-lg" role="img" aria-label="UA">🇺🇦</span> },
    ]), []);

    useEffect(() => {
        const shouldLock = isExportModalOpen || isPasswordDisplayOpen || isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isCloudSyncModalOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isExportModalOpen, isPasswordDisplayOpen, isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isCloudSyncModalOpen]);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);

    // Sync to cloud when data changes
    const syncDataToCloud = async () => {
        // Skip sync if we're currently importing from cloud
        if (isImportingRef.current) {
            console.log('Skipping auto-sync during import');
            return;
        }

        if (!syncConfig.isEnabled) return;

        // Prevent uploading empty data ONLY during initial load (before initialLoadCompleteRef is set)
        // After initial load, allow syncing empty data (user intentionally cleared all data)
        if (events.length === 0 && !initialLoadCompleteRef.current) {
            console.log('Skipping sync: initial load not complete, avoiding overwriting cloud data');
            return;
        }

        setSyncStatus(prev => ({ ...prev, isSyncing: true, lastSyncError: null }));

        const exportedAt = new Date().toISOString();
        lastLocalModificationRef.current = exportedAt; // Update local modification time

        const data: SyncData = {
            meta: { version: 1, exportedAt },
            weight: weight,
            events: events
        };

        try {
            const success = await syncToCloud(syncConfig, data);
            if (success) {
                setSyncStatus(prev => ({
                    ...prev,
                    isSyncing: false,
                    lastSyncTime: new Date(),
                    lastSyncError: null
                }));
                console.log('Data synced to cloud successfully');
            } else {
                setSyncStatus(prev => ({
                    ...prev,
                    isSyncing: false,
                    lastSyncError: '同步失败，请检查配置'
                }));
            }
        } catch (error) {
            console.error('Failed to sync data to cloud:', error);
            setSyncStatus(prev => ({
                ...prev,
                isSyncing: false,
                lastSyncError: '网络错误，同步失败'
            }));
        }
    };

    useEffect(() => {
        localStorage.setItem('hrt-events', JSON.stringify(events));

        // Debounce sync to avoid multiple rapid uploads
        if (syncTimerRef.current) {
            clearTimeout(syncTimerRef.current);
        }
        syncTimerRef.current = setTimeout(() => {
            syncDataToCloud();
        }, 1000); // Wait 1 second after last change before syncing

        return () => {
            if (syncTimerRef.current) {
                clearTimeout(syncTimerRef.current);
            }
        };
    }, [events, syncConfig]);

    useEffect(() => {
        localStorage.setItem('hrt-weight', weight.toString());

        // Debounce sync to avoid multiple rapid uploads
        if (syncTimerRef.current) {
            clearTimeout(syncTimerRef.current);
        }
        syncTimerRef.current = setTimeout(() => {
            syncDataToCloud();
        }, 1000); // Wait 1 second after last change before syncing

        return () => {
            if (syncTimerRef.current) {
                clearTimeout(syncTimerRef.current);
            }
        };
    }, [weight, syncConfig]);

    useEffect(() => { localStorage.setItem('hrt-sync-config', JSON.stringify(syncConfig)); }, [syncConfig]);

    // Load data from cloud on component mount if sync is enabled
    useEffect(() => {
        const loadFromCloud = async () => {
            if (!syncConfig.isEnabled) {
                console.log('Cloud sync disabled, using local data');
                initialLoadCompleteRef.current = true; // Mark initial load as complete
                return;
            }

            console.log('=== LOADING FROM CLOUD ON STARTUP ===');
            isImportingRef.current = true; // Prevent auto-sync during initial load

            try {
                const cloudData = await fetchFromCloud(syncConfig);
                if (cloudData && cloudData.events && cloudData.events.length > 0) {
                    console.log('Cloud data found, loading:', cloudData.events.length, 'events');
                    setEvents(cloudData.events);
                    setWeight(cloudData.weight ?? 70.0);

                    // Update local modification time to cloud time
                    if (cloudData.meta && cloudData.meta.exportedAt) {
                        lastLocalModificationRef.current = cloudData.meta.exportedAt;
                        console.log('Updated lastLocalModificationRef to:', cloudData.meta.exportedAt);
                    }
                } else if (cloudData && cloudData.meta && cloudData.meta.exportedAt) {
                    // Cloud data exists but is empty - still need to sync time
                    console.log('Cloud data is empty');
                    setEvents([]);
                    setWeight(cloudData.weight ?? 70.0);
                    lastLocalModificationRef.current = cloudData.meta.exportedAt;
                } else {
                    console.log('No cloud data, using local data');
                }
            } catch (error) {
                console.error('Failed to load from cloud:', error);
            } finally {
                setTimeout(() => {
                    isImportingRef.current = false;
                    initialLoadCompleteRef.current = true; // Mark initial load as complete
                    console.log('Initial load complete');
                }, 500);
            }
        };

        loadFromCloud();
    }, []); // Run once on mount

    // Poll cloud data periodically to detect changes from other devices
    useEffect(() => {
        if (!syncConfig.isEnabled) return;

        const pollInterval = setInterval(async () => {
            // Skip if we're currently syncing or importing
            if (isImportingRef.current || syncStatus.isSyncing) {
                console.log('Skipping poll: already syncing or importing');
                return;
            }

            // Skip if there's a pending sync (debounce timer is active)
            if (syncTimerRef.current) {
                console.log('Skipping poll: local changes pending sync');
                return;
            }

            console.log('=== POLLING CLOUD DATA ===');
            try {
                const cloudData = await fetchFromCloud(syncConfig);
                if (cloudData && cloudData.meta && cloudData.meta.exportedAt) {
                    const cloudTime = cloudData.meta.exportedAt;
                    const localTime = lastLocalModificationRef.current;

                    console.log('Cloud time:', cloudTime);
                    console.log('Local time:', localTime);
                    console.log('Cloud events count:', cloudData.events?.length ?? 0);

                    // If cloud data is newer than local, overwrite local UNCONDITIONALLY
                    if (cloudTime > localTime) {
                        console.log('Cloud data is newer, updating local data');
                        isImportingRef.current = true; // Prevent triggering upload

                        // Always set events and weight, even if they're empty/default
                        // This ensures deletions are synced properly
                        setEvents(cloudData.events || []);
                        setWeight(cloudData.weight ?? 70.0);

                        // Update local modification time to cloud time
                        lastLocalModificationRef.current = cloudTime;

                        setTimeout(() => {
                            isImportingRef.current = false;
                            console.log('Auto-sync from cloud complete');
                        }, 100);
                    } else {
                        console.log('Local data is up to date');
                    }
                }
            } catch (error) {
                console.error('Failed to poll cloud data:', error);
            }
        }, 30000); // Poll every 30 seconds

        return () => clearInterval(pollInterval);
    }, [syncConfig.isEnabled, syncConfig.syncUrl, syncConfig.username, syncConfig.password, syncStatus.isSyncing]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Reset scroll when switching tabs to avoid carrying over deep scroll positions
    useEffect(() => {
        const el = mainScrollRef.current;
        if (el) el.scrollTo({ top: 0, behavior: 'auto' });
    }, [currentView]);

    useEffect(() => {
        if (events.length > 0) {
            const res = runSimulation(events, weight);
            setSimulation(res);
        } else {
            setSimulation(null);
        }
    }, [events, weight]);

    const currentLevel = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        return interpolateConcentration(simulation, h) || 0;
    }, [simulation, currentTime]);

    const groupedEvents = useMemo(() => {
        const sorted = [...events].sort((a, b) => b.timeH - a.timeH);
        const groups: Record<string, DoseEvent[]> = {};
        sorted.forEach(e => {
            const d = formatDate(new Date(e.timeH * 3600000), lang);
            if (!groups[d]) groups[d] = [];
            groups[d].push(e);
        });
        return groups;
    }, [events, lang]);

    const sanitizeImportedEvents = (raw: any): DoseEvent[] => {
        if (!Array.isArray(raw)) throw new Error('Invalid format');
        return raw
            .map((item: any) => {
                if (!item || typeof item !== 'object') return null;
                const { route, timeH, doseMG, ester, extras } = item;
                if (!Object.values(Route).includes(route)) return null;
                const timeNum = Number(timeH);
                if (!Number.isFinite(timeNum)) return null;
                const doseNum = Number(doseMG);
                const validEster = Object.values(Ester).includes(ester) ? ester : Ester.E2;
                const sanitizedExtras = (extras && typeof extras === 'object') ? extras : {};
                return {
                    id: typeof item.id === 'string' ? item.id : uuidv4(),
                    route,
                    timeH: timeNum,
                    doseMG: Number.isFinite(doseNum) ? doseNum : 0,
                    ester: validEster,
                    extras: sanitizedExtras
                } as DoseEvent;
            })
            .filter((item): item is DoseEvent => item !== null);
    };

    const processImportedData = (parsed: any): boolean => {
        try {
            let newEvents: DoseEvent[] = [];
            let newWeight: number | undefined = undefined;

            if (Array.isArray(parsed)) {
                newEvents = sanitizeImportedEvents(parsed);
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.events)) {
                    newEvents = sanitizeImportedEvents(parsed.events);
                }
                if (typeof parsed.weight === 'number' && parsed.weight > 0) {
                    newWeight = parsed.weight;
                }
            }

            if (!newEvents.length && !newWeight) throw new Error('No valid entries');
            
            if (newEvents.length > 0) setEvents(newEvents);
            if (newWeight !== undefined) setWeight(newWeight);

            showDialog('alert', t('drawer.import_success'));
            return true;
        } catch (err) {
                console.error(err);
                showDialog('alert', t('drawer.import_error'));
                return false;
        }
    };

    const importEventsFromJson = (text: string): boolean => {
        try {
            const parsed = JSON.parse(text);
            
            if (parsed.encrypted && parsed.iv && parsed.salt && parsed.data) {
                setPendingImportText(text);
                setIsPasswordInputOpen(true);
                return true; 
            }

            return processImportedData(parsed);
        } catch (err) {
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const handleAddEvent = () => {
        setEditingEvent(null);
        setIsFormOpen(true);
    };

    const handleEditEvent = (e: DoseEvent) => {
        setEditingEvent(e);
        setIsFormOpen(true);
    };

    const handleSaveEvent = (e: DoseEvent) => {
        setEvents(prev => {
            const exists = prev.find(p => p.id === e.id);
            if (exists) {
                return prev.map(p => p.id === e.id ? e : p);
            }
            return [...prev, e];
        });
    };

    const handleDeleteEvent = (id: string) => {
        showDialog('confirm', t('timeline.delete_confirm'), () => {
            setEvents(prev => prev.filter(e => e.id !== id));
        });
    };

    const handleClearAllEvents = () => {
        if (!events.length) return;
        showDialog('confirm', t('drawer.clear_confirm'), () => {
            setEvents([]);
        });
    };

    const handleSaveDosages = () => {
        if (events.length === 0) {
            showDialog('alert', t('drawer.empty_export'));
            return;
        }
        setIsExportModalOpen(true);
    };

    const downloadFile = (data: string, filename: string) => {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportConfirm = async (encrypt: boolean) => {
        setIsExportModalOpen(false);
        const exportData = {
            meta: { version: 1, exportedAt: new Date().toISOString() },
            weight: weight,
            events: events
        };
        const json = JSON.stringify(exportData, null, 2);
        
        if (encrypt) {
            const { data, password } = await encryptData(json);
            setGeneratedPassword(password);
            setIsPasswordDisplayOpen(true);
            downloadFile(data, `hrt-dosages-encrypted-${new Date().toISOString().split('T')[0]}.json`);
        } else {
            downloadFile(json, `hrt-dosages-${new Date().toISOString().split('T')[0]}.json`);
        }
    };

    const handlePasswordSubmit = async (password: string) => {
        if (!pendingImportText) return;
        const decrypted = await decryptData(pendingImportText, password);
        if (decrypted) {
            setIsPasswordInputOpen(false);
            setPendingImportText(null);
            try {
                const parsed = JSON.parse(decrypted);
                processImportedData(parsed);
            } catch (e) {
                showDialog('alert', t('import.decrypt_error'));
            }
        } else {
            showDialog('alert', t('import.decrypt_error'));
        }
    };

    const handleCloudSyncSave = async (newConfig: SyncConfig) => {
        const wasEnabled = syncConfig.isEnabled;
        setSyncConfig(newConfig);

        // If user just enabled sync, fetch data from cloud and overwrite local data
        if (!wasEnabled && newConfig.isEnabled) {
            try {
                const cloudData = await fetchFromCloud(newConfig);
                if (cloudData) {
                    if (window.confirm('检测到云端数据，是否用云端数据覆盖本地数据？')) {
                        // Unconditionally set events and weight from cloud
                        setEvents(cloudData.events || []);
                        setWeight(cloudData.weight ?? 70.0);

                        // Update local modification time to cloud time
                        if (cloudData.meta && cloudData.meta.exportedAt) {
                            lastLocalModificationRef.current = cloudData.meta.exportedAt;
                            console.log('Updated lastLocalModificationRef to:', cloudData.meta.exportedAt);
                        }

                        showDialog('alert', '已从云端同步数据');
                    }
                }
            } catch (error) {
                console.error('Failed to fetch from cloud:', error);
                showDialog('alert', '从云端获取数据失败，请检查配置');
            }
        }
    };

    const handleImportFromCloud = (data: SyncData) => {
        console.log('=== IMPORT FROM CLOUD START ===');
        console.log('Full data received:', JSON.stringify(data, null, 2));
        console.log('Events array:', data.events, 'Length:', data.events?.length ?? 0);
        console.log('Weight value:', data.weight);
        console.log('Current events before import:', events.length);
        console.log('Current weight before import:', weight);

        // Set flag to prevent auto-sync during import
        isImportingRef.current = true;
        console.log('Set isImportingRef to true');

        // Unconditionally set events and weight from cloud data
        setEvents(data.events || []);
        setWeight(data.weight ?? 70.0);

        // Update local modification time to cloud time
        if (data.meta && data.meta.exportedAt) {
            lastLocalModificationRef.current = data.meta.exportedAt;
            console.log('Updated lastLocalModificationRef to:', data.meta.exportedAt);
        }

        // Reset flag after state updates are complete
        setTimeout(() => {
            console.log('=== IMPORT TIMEOUT CALLBACK ===');
            console.log('isImportingRef before reset:', isImportingRef.current);
            isImportingRef.current = false;
            console.log('Import complete, auto-sync re-enabled');
        }, 100);

        showDialog('alert', '已从云端导入数据');
        console.log('=== IMPORT FROM CLOUD END ===');
    };

    return (
        <div className="h-screen w-full bg-white flex flex-col font-sans text-gray-900 select-none overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-white shadow-xl shadow-gray-900/10">
                {/* Header */}
                {currentView === 'home' && (
                    <header className="relative px-4 md:px-8 pt-10 pb-6 rounded-b-[2.5rem]">
                        <div className="relative bg-white border border-gray-100 rounded-3xl shadow-lg shadow-gray-100 px-5 md:px-8 py-6 md:py-8">
                            <div className="flex justify-between items-start gap-3 mb-4 md:mb-6">
                                <div>
                                    <h1 className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-50 text-[11px] md:text-xs font-semibold text-gray-600 tracking-tight border border-gray-100 mb-1">
                                        {t('status.estimate')}
                                    </h1>
                                    <div className="flex items-end gap-2">
                                        <span className="text-6xl md:text-7xl lg:text-8xl font-black text-gray-900 tracking-tighter">
                                            {currentLevel.toFixed(0)}
                                        </span>
                                        <span className="text-lg md:text-xl lg:text-2xl font-bold text-gray-400">pg/mL</span>
                                    </div>
                                </div>
                                <div className="text-right text-xs font-medium text-gray-400 leading-tight">
                                    <div className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-100 inline-flex items-center gap-2">
                                        <Calendar size={14} className="text-pink-400" />
                                        <span className="text-xs md:text-sm">{formatDate(currentTime, lang)}</span>
                                    </div>
                                    <div className="mt-2 text-[11px] md:text-xs font-bold text-gray-500">
                                        {formatTime(currentTime)}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4">
                                <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-gray-50/80 border border-gray-100 shadow-sm">
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white flex items-center justify-center shadow-inner">
                                        <Activity size={18} className="text-pink-400 md:w-5 md:h-5" />
                                    </div>
                                    <div className="leading-tight">
                                        <p className="text-[11px] md:text-xs font-semibold text-gray-500">{t('timeline.title')}</p>
                                        <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{events.length || 0}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsWeightModalOpen(true)}
                                    className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-gray-50 border border-gray-100 shadow-sm hover:shadow-md transition"
                                >
                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white flex items-center justify-center shadow-inner">
                                        <Settings size={18} className="text-gray-500 md:w-5 md:h-5" />
                                    </div>
                                    <div className="text-left leading-tight">
                                        <p className="text-[11px] md:text-xs font-semibold text-gray-500">{t('status.weight')}</p>
                                        <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{weight} kg</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </header>
                )}

                <main ref={mainScrollRef} className="flex-1 overflow-y-auto bg-white w-full scrollbar-hide px-4 py-6">
                    {/* Chart */}
                    {currentView === 'home' && (
                        <ResultChart 
                            sim={simulation} 
                            events={events}
                            onPointClick={handleEditEvent}
                        />
                    )}

                    {/* Timeline */}
                    {currentView === 'history' && (
                        <div className="relative space-y-5 pt-6 pb-16">
                            <div className="px-4">
                                <div className="w-full p-4 rounded-2xl bg-white flex items-center justify-between shadow-sm">
                                    <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                                       <Activity size={22} className="text-[#f6c4d7]" /> {t('timeline.title')}
                                    </h2>
                                    <div className="min-w-[136px] h-11" />
                                </div>
                            </div>

                            {Object.keys(groupedEvents).length === 0 && (
                                <div className="mx-4 text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                                   <p>{t('timeline.empty')}</p>
                                </div>
                            )}

                            {Object.entries(groupedEvents).map(([date, items]) => (
                                <div key={date} className="relative mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="sticky top-0 bg-white/95 backdrop-blur py-3 px-4 z-0 flex items-center gap-2 border-b border-gray-100">
                                        <div className="w-2 h-2 rounded-full bg-pink-200"></div>
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{date}</span>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {(items as DoseEvent[]).map(ev => (
                                            <div 
                                                key={ev.id} 
                                                onClick={() => handleEditEvent(ev)}
                                                className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-all cursor-pointer group relative"
                                            >
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${ev.route === Route.injection ? 'bg-pink-50' : 'bg-gray-50'} border border-gray-100`}>
                                                    {getRouteIcon(ev.route)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-bold text-gray-900 text-sm truncate">
                                                            {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                        </span>
                                                        <span className="font-mono text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                                            {formatTime(new Date(ev.timeH * 3600000))}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 font-medium space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                            {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                                <>
                                                                    <span className="text-gray-300">•</span>
                                                                    <span className="text-gray-700">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-700">
                                                                <span>{`${t('timeline.dose_label')}: ${ev.doseMG.toFixed(2)} mg`}</span>
                                                                {ev.ester !== Ester.E2 && (
                                                                    <span className="text-gray-500 text-[11px]">
                                                                        {`(${ (ev.doseMG * getToE2Factor(ev.ester)).toFixed(2) } mg E2)`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            
                            {/* Floating action button above bottom nav */}
                            <div className="fixed left-1/2 bottom-28 -translate-x-1/2 z-30 w-full max-w-md px-4 pointer-events-none">
                                <button
                                    onClick={handleAddEvent}
                                    className="pointer-events-auto w-full bg-gray-900 text-white px-4 py-3 rounded-full flex items-center justify-center gap-2 shadow-lg shadow-gray-300/60 hover:translate-y-[-2px] active:translate-y-0 transition-transform"
                                >
                                    <Plus size={18} />
                                    <span className="font-bold text-sm">{t('btn.add')}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Settings */}
                    {currentView === 'settings' && (
                        <div className="relative space-y-5 pt-6 pb-8">
                            <div className="px-4">
                                <div className="w-full p-4 rounded-2xl bg-white flex items-center justify-between shadow-sm">
                                    <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                                        <Settings size={22} className="text-[#f6c4d7]" /> {t('nav.settings')}
                                    </h2>
                                    <div className="min-w-[136px] h-11" />
                                </div>
                            </div>

                            {/* General Settings */}
                            <div className="space-y-2">
                                <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.general')}</h3>
                                <div className="mx-4 w-auto p-4 rounded-2xl border border-gray-200 bg-white space-y-3 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <Languages className="text-blue-500" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.lang')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.lang_hint')}</p>
                                        </div>
                                        <div className="ml-auto text-xs font-bold text-gray-500">{lang.toUpperCase()}</div>
                                    </div>
                                    <CustomSelect
                                        value={lang}
                                        onChange={(val) => setLang(val as Lang)}
                                        options={languageOptions}
                                    />
                                </div>
                            </div>

                            {/* Data Management */}
                            <div className="space-y-2">
                                <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.data')}</h3>
                                <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                                    <button
                                        onClick={() => setIsImportModalOpen(true)}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-teal-50 transition text-left"
                                    >
                                        <Upload className="text-teal-500" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('import.title')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.import_hint')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleSaveDosages}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-pink-50 transition text-left"
                                    >
                                        <Download className="text-pink-400" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('export.title')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.save_hint')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleClearAllEvents}
                                        disabled={!events.length}
                                        className={`w-full flex items-center gap-3 px-4 py-4 text-left transition ${events.length ? 'hover:bg-red-50' : 'bg-gray-50 cursor-not-allowed opacity-60'}`}
                                    >
                                        <Trash2 className="text-red-400" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.clear')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.clear_confirm')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setIsCloudSyncModalOpen(true)}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-blue-50 transition text-left"
                                    >
                                        <div className="relative">
                                            <Cloud className="text-blue-500" size={20} />
                                            {syncStatus.isSyncing && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                                            )}
                                        </div>
                                        <div className="text-left flex-1">
                                            <p className="font-bold text-gray-900 text-sm">云端同步</p>
                                            <p className="text-xs text-gray-500">
                                                {syncConfig.isEnabled ? (
                                                    syncStatus.lastSyncError ? (
                                                        <span className="text-red-500">{syncStatus.lastSyncError}</span>
                                                    ) : syncStatus.lastSyncTime ? (
                                                        `上次同步: ${syncStatus.lastSyncTime.toLocaleString()}`
                                                    ) : (
                                                        '设置云端数据同步'
                                                    )
                                                ) : (
                                                    '设置云端数据同步'
                                                )}
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* About */}
                            <div className="space-y-2">
                                <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.about')}</h3>
                                <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                                    <button
                                        onClick={() => {
                                            showDialog('confirm', t('drawer.model_confirm'), () => {
                                                window.open('https://misaka23323.com/articles/estrogen-model-summary', '_blank');
                                            });
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-purple-50 transition text-left"
                                    >
                                        <Info className="text-purple-500" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.model_title')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.model_desc')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            showDialog('confirm', t('drawer.github_confirm'), () => {
                                                window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                                            });
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
                                    >
                                        <Github className="text-gray-700" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.github')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.github_desc')}</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Version Footer */}
                            <div className="pt-2 pb-4 flex justify-center">
                                <p className="text-xs font-medium text-gray-300">
                                    {APP_VERSION}
                                </p>
                            </div>
                        </div>
                    )}
                </main>

                {/* Bottom Navigation - Glassmorphism capsule style */}
                <nav className="px-4 pb-4 pt-2 bg-transparent z-20 safe-area-pb shrink-0">
                    <div className="w-full bg-white/70 backdrop-blur-lg border border-white/40 rounded-3xl px-3 py-3 flex items-center justify-between gap-2">
                        <button
                            onClick={() => setCurrentView('home')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'home'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Activity size={22} className={currentView === 'home' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.home')}</span>
                        </button>
                        <button
                            onClick={() => setCurrentView('history')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'history'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Calendar size={22} className={currentView === 'history' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.history')}</span>
                        </button>
                        <button
                            onClick={() => setCurrentView('settings')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'settings'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Settings size={22} className={currentView === 'settings' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.settings')}</span>
                        </button>
                    </div>
                </nav>
            </div>

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportConfirm}
                events={events}
                weight={weight}
            />

            <PasswordDisplayModal
                isOpen={isPasswordDisplayOpen}
                onClose={() => setIsPasswordDisplayOpen(false)}
                password={generatedPassword}
            />

            <PasswordInputModal
                isOpen={isPasswordInputOpen}
                onClose={() => setIsPasswordInputOpen(false)}
                onConfirm={handlePasswordSubmit}
            />

            <WeightEditorModal 
                isOpen={isWeightModalOpen} 
                onClose={() => setIsWeightModalOpen(false)} 
                currentWeight={weight} 
                onSave={setWeight} 
            />
            
            <DoseFormModal 
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                eventToEdit={editingEvent}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
            />

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportJson={(payload) => {
                    const ok = importEventsFromJson(payload);
                    return ok;
                }}
            />

            <CloudSyncModal
                isOpen={isCloudSyncModalOpen}
                onClose={() => setIsCloudSyncModalOpen(false)}
                currentConfig={syncConfig}
                onSave={handleCloudSyncSave}
                onImportFromCloud={handleImportFromCloud}
            />
        </div>
    );
};

const App = () => (
    <LanguageProvider>
        <DialogProvider>
            <AppContent />
        </DialogProvider>
    </LanguageProvider>
);

export default App;
