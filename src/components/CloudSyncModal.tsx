import React, { useState } from 'react';
import { X, Cloud, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { SyncConfig, fetchFromCloud } from '../../logic';

interface CloudSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentConfig: SyncConfig;
    onSave: (config: SyncConfig) => void;
    onImportFromCloud: (data: any) => void;
}

const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
    isOpen,
    onClose,
    currentConfig,
    onSave,
    onImportFromCloud
}) => {
    const { t } = useTranslation();
    const [config, setConfig] = useState<SyncConfig>(currentConfig);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleSave = () => {
        onSave(config);
        onClose();
    };

    const handleTestConnection = async () => {
        if (!config.syncUrl || !config.username || !config.password) {
            setTestResult({ success: false, message: t('cloud.fill_all_fields') });
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const data = await fetchFromCloud(config);
            if (data) {
                setTestResult({ success: true, message: t('cloud.connection_success_data') });
            } else {
                setTestResult({ success: true, message: t('cloud.connection_success_no_data') });
            }
        } catch (error) {
            setTestResult({ success: false, message: t('cloud.connection_failed') });
        } finally {
            setIsTesting(false);
        }
    };

    const handleImportFromCloud = async () => {
        if (!config.syncUrl || !config.username || !config.password) {
            setTestResult({ success: false, message: t('cloud.fill_all_fields') });
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const data = await fetchFromCloud(config);
            if (data) {
                // 确认覆盖本地数据
                if (window.confirm(t('cloud.confirm_overwrite'))) {
                    onImportFromCloud(data);
                    setTestResult({ success: true, message: t('cloud.import_success') });
                }
            } else {
                setTestResult({ success: false, message: t('cloud.no_data') });
            }
        } catch (error) {
            setTestResult({ success: false, message: t('cloud.import_failed') });
        } finally {
            setIsTesting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <Cloud size={24} className="text-blue-500" />
                        {t('cloud.settings_title')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{t('cloud.enable_sync')}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.isEnabled}
                                onChange={(e) => setConfig(prev => ({ ...prev, isEnabled: e.target.checked }))}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* URL Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('cloud.url_label')}
                        </label>
                        <input
                            type="url"
                            value={config.syncUrl}
                            onChange={(e) => setConfig(prev => ({ ...prev, syncUrl: e.target.value }))}
                            placeholder="https://your-domain.com"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Username Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('cloud.username_label')}
                        </label>
                        <input
                            type="text"
                            value={config.username}
                            onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                            placeholder="用户名"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Password Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t('cloud.password_label')}
                        </label>
                        <input
                            type="password"
                            value={config.password}
                            onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                            placeholder="密码"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Test Connection */}
                    <div className="pt-2">
                        <button
                            onClick={handleTestConnection}
                            disabled={isTesting || !config.syncUrl || !config.username || !config.password}
                            className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isTesting ? (
                                <>
                                    <Loader size={16} className="animate-spin" />
                                    {t('cloud.testing_connection')}
                                </>
                            ) : (
                                <>
                                    <Cloud size={16} />
                                    {t('cloud.test_connection')}
                                </>
                            )}
                        </button>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div className={`p-3 rounded-lg flex items-center gap-2 ${
                            testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                            {testResult.success ? (
                                <CheckCircle size={16} />
                            ) : (
                                <AlertTriangle size={16} />
                            )}
                            <span className="text-sm">{testResult.message}</span>
                        </div>
                    )}

                    {/* Import from Cloud */}
                    {config.isEnabled && (
                        <div className="pt-2 border-t border-gray-100">
                            <button
                                onClick={handleImportFromCloud}
                                disabled={isTesting || !config.syncUrl || !config.username || !config.password}
                                className="w-full bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isTesting ? (
                                    <>
                                        <Loader size={16} className="animate-spin" />
                                        {t('cloud.importing')}
                                    </>
                                ) : (
                                    <>
                                        <Cloud size={16} />
                                        {t('cloud.import_data')}
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 mt-1 text-center">
                                {t('cloud.warning_overwrite')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                    >
                        {t('btn.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition"
                    >
                        {t('btn.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CloudSyncModal;