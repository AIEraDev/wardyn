export type SupportedLanguage = 'en' | 'fr' | 'es' | 'de' | 'zh' | 'ja';

export interface TranslationDictionary {
  today: string;
  messages: string;
  content: string;
  deadlines: string;
  channels: string;
  settings: string;
  needs_your_reply: string;
  approve: string;
  save_and_approve: string;
  edit_copy: string;
  skip: string;
  refine: string;
  shorter: string;
  formal: string;
  availability: string;
  punchy: string;
  detailed: string;
  thread: string;
  connect_gmail: string;
  sync: string;
  to_review: string;
  uncertain_review_required: string;
  flagged_visa_warning: string;
  language: string;
  desktop_notifications: string;
  auto_start: string;
  sync_frequency: string;
  connected_channels: string;
  no_linkedin_data: string;
  sync_linkedin_activity: string;
  new_social_brief: string;
  analytics: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    today: 'Today',
    messages: 'Messages',
    content: 'Content',
    deadlines: 'Deadlines',
    channels: 'Channels',
    settings: 'Settings',
    needs_your_reply: 'NEEDS YOUR REPLY',
    approve: 'Approve & Send',
    save_and_approve: 'Save & Approve',
    edit_copy: 'Edit Copy',
    skip: 'Skip',
    refine: 'Refine:',
    shorter: 'Shorter',
    formal: 'Formal',
    availability: 'Add Times',
    punchy: 'Punchy',
    detailed: 'Detailed',
    thread: 'Thread',
    connect_gmail: 'Connect Gmail',
    sync: 'Sync',
    to_review: 'to review',
    uncertain_review_required: 'Uncertain — manual review required',
    flagged_visa_warning: 'Urgent Visa / UKVI Deadline Detected',
    language: 'Language',
    desktop_notifications: 'Desktop Notifications',
    auto_start: 'Auto-Start on Boot',
    sync_frequency: 'Sync Frequency',
    connected_channels: 'Connected Channels',
    no_linkedin_data: 'No LinkedIn Timeline Data Synced Yet',
    sync_linkedin_activity: 'Sync LinkedIn Activity',
    new_social_brief: 'New Social Brief',
    analytics: 'Analytics',
  },
  fr: {
    today: "Aujourd'hui",
    messages: 'Messages',
    content: 'Contenu',
    deadlines: 'Échéances',
    channels: 'Canaux',
    settings: 'Paramètres',
    needs_your_reply: 'NÉCESSITE VOTRE RÉPONSE',
    approve: 'Approuver et Envoyer',
    save_and_approve: 'Enregistrer et Approuver',
    edit_copy: 'Modifier le Texte',
    skip: 'Passer',
    refine: 'Ajuster :',
    shorter: 'Court',
    formal: 'Formel',
    availability: 'Ajouter Horaires',
    punchy: 'Percutant',
    detailed: 'Détaillé',
    thread: 'Fil',
    connect_gmail: 'Connecter Gmail',
    sync: 'Synchroniser',
    to_review: 'à réviser',
    uncertain_review_required: 'Incertain — révision manuelle requise',
    flagged_visa_warning: 'Urgent : Échéance Visa / UKVI détectée',
    language: 'Langue',
    desktop_notifications: 'Notifications Bureau',
    auto_start: 'Démarrage Automatique',
    sync_frequency: 'Fréquence de Sync',
    connected_channels: 'Canaux Connectés',
    no_linkedin_data: 'Aucune donnée LinkedIn synchronisée',
    sync_linkedin_activity: 'Sync Activité LinkedIn',
    new_social_brief: 'Nouveau Brief Social',
    analytics: 'Analytique',
  },
  es: {
    today: 'Hoy',
    messages: 'Mensajes',
    content: 'Contenido',
    deadlines: 'Plazos',
    channels: 'Canales',
    settings: 'Ajustes',
    needs_your_reply: 'REQUIERE TU RESPUESTA',
    approve: 'Aprobar y Enviar',
    save_and_approve: 'Guardar y Aprobar',
    edit_copy: 'Editar Texto',
    skip: 'Omitir',
    refine: 'Refinar:',
    shorter: 'Más Corto',
    formal: 'Formal',
    availability: 'Añadir Horarios',
    punchy: 'Impactante',
    detailed: 'Detallado',
    thread: 'Hilo',
    connect_gmail: 'Conectar Gmail',
    sync: 'Sincronizar',
    to_review: 'por revisar',
    uncertain_review_required: 'Incierto — revisión manual requerida',
    flagged_visa_warning: 'Urgente: Plazo de Visa / UKVI detectado',
    language: 'Idioma',
    desktop_notifications: 'Notificaciones de Escritorio',
    auto_start: 'Inicio Automático',
    sync_frequency: 'Frecuencia de Sincronización',
    connected_channels: 'Canales Conectados',
    no_linkedin_data: 'Sin datos de LinkedIn sincronizados',
    sync_linkedin_activity: 'Sincronizar Actividad LinkedIn',
    new_social_brief: 'Nuevo Resumen Social',
    analytics: 'Analítica',
  },
  de: {
    today: 'Heute',
    messages: 'Nachrichten',
    content: 'Inhalte',
    deadlines: 'Fristen',
    channels: 'Kanäle',
    settings: 'Einstellungen',
    needs_your_reply: 'ANTWORT ERFORDERLICH',
    approve: 'Genehmigen & Senden',
    save_and_approve: 'Speichern & Genehmigen',
    edit_copy: 'Text Bearbeiten',
    skip: 'Überspringen',
    refine: 'Verfeinern:',
    shorter: 'Kürzer',
    formal: 'Formell',
    availability: 'Zeiten Hinzufügen',
    punchy: 'Prägnant',
    detailed: 'Detailliert',
    thread: 'Thread',
    connect_gmail: 'Gmail Verbinden',
    sync: 'Synchronisieren',
    to_review: 'zu prüfen',
    uncertain_review_required: 'Unsicher — manuelle Prüfung erforderlich',
    flagged_visa_warning: 'Dringend: Visa / UKVI Frist Erkannt',
    language: 'Sprache',
    desktop_notifications: 'Desktop-Benachrichtigungen',
    auto_start: 'Autostart beim Booten',
    sync_frequency: 'Sync-Frequenz',
    connected_channels: 'Verbundene Kanäle',
    no_linkedin_data: 'Noch keine LinkedIn-Daten synchronisiert',
    sync_linkedin_activity: 'LinkedIn-Aktivität Sync',
    new_social_brief: 'Neuer Social-Brief',
    analytics: 'Analytik',
  },
  zh: {
    today: '今天',
    messages: '消息',
    content: '内容',
    deadlines: '截止日期',
    channels: '通道',
    settings: '设置',
    needs_your_reply: '需要您的回复',
    approve: '批准并发送',
    save_and_approve: '保存并批准',
    edit_copy: '编辑草稿',
    skip: '跳过',
    refine: '微调：',
    shorter: '更简短',
    formal: '正式',
    availability: '添加时间',
    punchy: '简练有力',
    detailed: '详细',
    thread: '推文串',
    connect_gmail: '连接 Gmail',
    sync: '同步',
    to_review: '待审核',
    uncertain_review_required: '不确定 — 需要人工审核',
    flagged_visa_warning: '紧急：检测到签证 / UKVI 截止日期',
    language: '语言',
    desktop_notifications: '桌面通知',
    auto_start: '开机自动启动',
    sync_frequency: '同步频率',
    connected_channels: '已连接通道',
    no_linkedin_data: '尚未同步 LinkedIn 时间线数据',
    sync_linkedin_activity: '同步 LinkedIn 动态',
    new_social_brief: '新建社交简报',
    analytics: '分析',
  },
  ja: {
    today: '今日',
    messages: 'メッセージ',
    content: 'コンテンツ',
    deadlines: '期限',
    channels: 'チャンネル',
    settings: '設定',
    needs_your_reply: '返信が必要です',
    approve: '承認して送信',
    save_and_approve: '保存して承認',
    edit_copy: '文面を編集',
    skip: 'スキップ',
    refine: '調整：',
    shorter: '短く',
    formal: 'フォーマル',
    availability: '時間を追加',
    punchy: '簡潔',
    detailed: '詳細',
    thread: 'スレッド',
    connect_gmail: 'Gmailを連携',
    sync: '同期',
    to_review: '件の確認待ち',
    uncertain_review_required: '要確認 — 手動レビューが必要です',
    flagged_visa_warning: '至急：ビザ / UKVI の期限が検出されました',
    language: '言語',
    desktop_notifications: 'デスクトップ通知',
    auto_start: '起動時に自動開始',
    sync_frequency: '同期頻度',
    connected_channels: '連携チャンネル',
    no_linkedin_data: 'LinkedInのデータはまだ同期されていません',
    sync_linkedin_activity: 'LinkedInアクティビティを同期',
    new_social_brief: '新規ソーシャルブリーフ',
    analytics: '分析',
  },
};

export const getTranslation = (lang: SupportedLanguage): TranslationDictionary => {
  return TRANSLATIONS[lang] || TRANSLATIONS.en;
};
