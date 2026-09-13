const ui = new WebUI();

const connectionPill = document.getElementById('connectionPill');
const toast = document.getElementById('toast');
const adminModePill = document.getElementById('adminModePill');
const adminInlineStatus = document.getElementById('adminInlineStatus');
let lastState = null;
let currentLang = localStorage.getItem('relief-ui-language') || 'en';
let adminVerified = false;
let adminRequestId = '';
let adminVerifyTimer = null;
let translationRequestId = '';
let translationWorking = false;
let hasEverConnected = false;
const noticeTranslationCache = new Map();
const noticeTranslationPending = new Set();

const LANG_LOCALES = {
  en: 'en-US', es: 'es-ES', ar: 'ar', hi: 'hi-IN', fr: 'fr-FR'
};

const PIN_VISIBILITY_LABELS = {
  en: {show:'Show PIN', hide:'Hide PIN'},
  es: {show:'Mostrar PIN', hide:'Ocultar PIN'},
  ar: {show:'إظهار الرمز', hide:'إخفاء الرمز'},
  hi: {show:'PIN दिखाएँ', hide:'PIN छिपाएँ'},
  fr: {show:'Afficher le PIN', hide:'Masquer le PIN'}
};

const TRANSLATIONS = {
  en: {
    appTitle:'Relief Node', appSubtitle:'Local emergency & climate response hub', languageLabel:'Language', adminMode:'Admin mode', adminIncorrect:'Organizer PIN is incorrect.', connecting:'Connecting…', online:'Local node online', reconnecting:'Reconnecting…',
    latestNotice:'Latest notice', loading:'Loading…', connectingToNode:'Connecting to the Relief Node.', loadingModel:'Loading model information…', localFirst:'Local-first delivery', updated:'Updated', safeStatus:'Safe', alertStatus:'Alert', emergencyStatus:'Emergency',
    climateLog:'Climate & public alert log', locationNotConfigured:'Location not configured', organizerSetLocation:'Organizer can set a location below.', offlineReady:'Offline ready', onlineDataCached:'Online data cached', partialData:'Partial data', logged:'Logged',
    temperature:'Temperature', condition:'Condition', humidity:'Humidity', wind:'Wind', precipitation:'Precipitation', today:'Today', precipShort:'precip', publicAlerts:'Public emergency/weather alerts', publicAlertsHelp:'Official source text is preserved as received.', active:'active', noAlertData:'No active alert data is stored for this location.', climateHistory:'Climate log history', time:'Time', tempShort:'Temp', alerts:'Alerts',
    checkinLabel:'Community check-in', howAreYou:'How are you?', checkinPrivacy:'Your check-in is stored locally on this Relief Node.', nameLabel:'Name or identifier', noteLabel:'Short note', optional:'Optional', notePlaceholder:'e.g. Room 4, need water', safeButton:'I’m safe', helpButton:'I need help', suppliesButton:'I need supplies',
    localSummary:'Local summary', total:'Total', needHelp:'Need help', suppliesStatus:'Supplies',
    organizer:'Organizer', emergencyControls:'Emergency controls', adminLocked:'Locked', adminVerified:'Verified', organizerPin:'Organizer PIN', pinPlaceholder:'Enter PIN', unlock:'Unlock', lock:'Lock', composeNotice:'Compose emergency notice', noticeTitleLabel:'Notice title', noticeTitlePlaceholder:'Weather alert', sourceInstructions:'Source instructions / notice', instructionsPlaceholder:'Enter verified emergency instructions.',
    aiAssist:'On-device AI assist', local:'LOCAL', makeActionCard:'Make short action card', targetLanguage:'Target language', languageNamePlaceholder:'Type any language', translateDraft:'Translate draft', translationReady:'Translation ready', translatingTo:'Translating to {language}…', translationComplete:'Translation complete — review the draft before publishing.', translationFailed:'Translation failed. Check the local model and try again.', aiDraftSafety:'On-device GenAI creates drafts locally. Nothing is published until the organizer approves it.', severity:'Severity', safeNormal:'Safe / normal', approvePublish:'Approve & publish notice', boardSafe:'Board safe', boardAlert:'Board alert', boardEmergency:'Board emergency', clearCheckins:'Clear check-ins',
    climateSettings:'Climate settings', publicDataSetup:'Public-data logger setup', locationLabel:'Location label', locationPlaceholder:'Community Center', latitude:'Latitude', longitude:'Longitude', usePhoneLocation:'Use this phone’s location', units:'Units', saveFetch:'Save & fetch', refreshNow:'Refresh now', climateSourceHelp:'Weather: Open-Meteo. U.S. alerts: National Weather Service. Last successful data remains cached locally.',
    onDeviceGenAI:'On-device GenAI', localLlmStatus:'Local LLM status', configured:'Configured', ready:'Local GenAI ready', needsAttention:'Local model needs attention', localLlmHelp:'The model runs on the UNO Q itself. No API key or internet is required after the one-time model download.', testLocalAi:'Test local AI',
    needsClustering:'Needs clustering', noCommunityNeeds:'No community needs yet.', recentCheckins:'Recent check-ins', noCheckins:'No check-ins yet.', offlineHotspot:'Offline hotspot', standaloneNetwork:'Standalone network mode', hotspotHelp:'Run the included host-side setup script from the UNO Q shell, not from App Lab.', aiDisclaimer:'AI-generated summaries and translations may occasionally be incomplete or inaccurate. Always verify critical emergency information before acting or publishing.',
    urgent_help:'Urgent help', medical:'Medical', water:'Water', food:'Food', shelter:'Shelter', power:'Power / charging', transport:'Transport', supplies_other:'Other supplies', helpBadge:'HELP', suppliesBadge:'SUPPLIES', safeBadge:'SAFE',
    noInstructions:'No instructions published.', locationSaved:'Location saved. Press Refresh now when internet is available.', phoneGeoUnavailable:'This browser does not expose geolocation.', phoneCoordsFilled:'Phone coordinates filled in. Press Save & fetch.', clearConfirm:'Clear every stored check-in?',
    aiFallback:'The local model failed previously; summaries will use the deterministic offline fallback until the model is available.', aiConfigured:'On-device GenAI creates drafts locally. Nothing is published until the organizer approves it.',
    weather0:'Clear',weather1:'Mostly clear',weather2:'Partly cloudy',weather3:'Overcast',weather45:'Fog',weather48:'Rime fog',weather51:'Light drizzle',weather53:'Drizzle',weather55:'Heavy drizzle',weather61:'Light rain',weather63:'Rain',weather65:'Heavy rain',weather71:'Light snow',weather73:'Snow',weather75:'Heavy snow',weather80:'Rain showers',weather81:'Rain showers',weather82:'Heavy rain showers',weather85:'Snow showers',weather86:'Heavy snow showers',weather95:'Thunderstorm',weather96:'Thunderstorm with hail',weather99:'Severe thunderstorm with hail', weatherUnknown:'Weather'
  },
  es: {
    appTitle:'Nodo de Ayuda', appSubtitle:'Centro local de respuesta a emergencias y clima', languageLabel:'Idioma', adminMode:'Modo administrador', adminIncorrect:'El PIN del organizador es incorrecto.', connecting:'Conectando…', online:'Nodo local conectado', reconnecting:'Reconectando…',
    latestNotice:'Aviso más reciente', loading:'Cargando…', connectingToNode:'Conectando con el Nodo de Ayuda.', loadingModel:'Cargando información del modelo…', localFirst:'Entrega local primero', updated:'Actualizado', safeStatus:'Seguro', alertStatus:'Alerta', emergencyStatus:'Emergencia',
    climateLog:'Registro climático y de alertas públicas', locationNotConfigured:'Ubicación no configurada', organizerSetLocation:'El organizador puede configurar una ubicación abajo.', offlineReady:'Listo sin conexión', onlineDataCached:'Datos en línea guardados', partialData:'Datos parciales', logged:'Registrado',
    temperature:'Temperatura', condition:'Condición', humidity:'Humedad', wind:'Viento', precipitation:'Precipitación', today:'Hoy', precipShort:'precip.', publicAlerts:'Alertas públicas de emergencia y clima', publicAlertsHelp:'El texto oficial de la fuente se conserva tal como se recibe.', active:'activas', noAlertData:'No hay alertas activas almacenadas para esta ubicación.', climateHistory:'Historial climático', time:'Hora', tempShort:'Temp.', alerts:'Alertas',
    checkinLabel:'Registro comunitario', howAreYou:'¿Cómo estás?', checkinPrivacy:'Tu registro se guarda localmente en este Nodo de Ayuda.', nameLabel:'Nombre o identificador', noteLabel:'Nota breve', optional:'Opcional', notePlaceholder:'p. ej., Sala 4, necesito agua', safeButton:'Estoy a salvo', helpButton:'Necesito ayuda', suppliesButton:'Necesito suministros',
    localSummary:'Resumen local', total:'Total', needHelp:'Necesitan ayuda', suppliesStatus:'Suministros',
    organizer:'Organizador', emergencyControls:'Controles de emergencia', adminLocked:'Bloqueado', adminVerified:'Verificado', organizerPin:'PIN del organizador', pinPlaceholder:'Ingresa el PIN', unlock:'Desbloquear', lock:'Bloquear', composeNotice:'Redactar aviso de emergencia', noticeTitleLabel:'Título del aviso', noticeTitlePlaceholder:'Alerta meteorológica', sourceInstructions:'Instrucciones / aviso de origen', instructionsPlaceholder:'Ingresa instrucciones de emergencia verificadas.',
    aiAssist:'Asistencia de IA en el dispositivo', local:'LOCAL', makeActionCard:'Crear tarjeta de acciones', targetLanguage:'Idioma de destino', languageNamePlaceholder:'Escribe cualquier idioma', translateDraft:'Traducir borrador', translationReady:'Traducción lista', translatingTo:'Traduciendo a {language}…', translationComplete:'Traducción terminada — revisa el borrador antes de publicarlo.', translationFailed:'La traducción falló. Comprueba el modelo local e inténtalo de nuevo.', aiDraftSafety:'La IA generativa crea borradores localmente. Nada se publica hasta que el organizador lo aprueba.', severity:'Gravedad', safeNormal:'Seguro / normal', approvePublish:'Aprobar y publicar aviso', boardSafe:'Placa segura', boardAlert:'Placa en alerta', boardEmergency:'Placa en emergencia', clearCheckins:'Borrar registros',
    climateSettings:'Configuración climática', publicDataSetup:'Configuración del registro de datos públicos', locationLabel:'Nombre de ubicación', locationPlaceholder:'Centro comunitario', latitude:'Latitud', longitude:'Longitud', usePhoneLocation:'Usar ubicación de este teléfono', units:'Unidades', saveFetch:'Guardar y obtener', refreshNow:'Actualizar ahora', climateSourceHelp:'Clima: Open-Meteo. Alertas de EE. UU.: National Weather Service. Los últimos datos correctos quedan guardados localmente.',
    onDeviceGenAI:'IA generativa en el dispositivo', localLlmStatus:'Estado del LLM local', configured:'Configurado', ready:'IA local lista', needsAttention:'El modelo local necesita atención', localLlmHelp:'El modelo se ejecuta en el UNO Q. No requiere clave API ni internet después de la descarga inicial.', testLocalAi:'Probar IA local',
    needsClustering:'Agrupación de necesidades', noCommunityNeeds:'Aún no hay necesidades comunitarias.', recentCheckins:'Registros recientes', noCheckins:'Aún no hay registros.', offlineHotspot:'Punto de acceso sin conexión', standaloneNetwork:'Modo de red independiente', hotspotHelp:'Ejecuta el script incluido desde la terminal del UNO Q, no desde App Lab.', aiDisclaimer:'Los resúmenes y traducciones generados por IA a veces pueden estar incompletos o ser inexactos. Verifica siempre la información crítica de emergencia antes de actuar o publicarla.',
    urgent_help:'Ayuda urgente', medical:'Médico', water:'Agua', food:'Alimentos', shelter:'Refugio', power:'Energía / carga', transport:'Transporte', supplies_other:'Otros suministros', helpBadge:'AYUDA', suppliesBadge:'SUMINISTROS', safeBadge:'SEGURO',
    noInstructions:'No se han publicado instrucciones.', locationSaved:'Ubicación guardada. Pulsa Actualizar ahora cuando haya internet.', phoneGeoUnavailable:'Este navegador no ofrece geolocalización.', phoneCoordsFilled:'Coordenadas del teléfono completadas. Pulsa Guardar y obtener.', clearConfirm:'¿Borrar todos los registros almacenados?',
    aiFallback:'El modelo local falló anteriormente; los resúmenes usarán el método determinista sin conexión hasta que el modelo esté disponible.', aiConfigured:'La IA generativa crea borradores localmente. Nada se publica hasta que el organizador lo aprueba.',
    weather0:'Despejado',weather1:'Mayormente despejado',weather2:'Parcialmente nublado',weather3:'Nublado',weather45:'Niebla',weather48:'Niebla con escarcha',weather51:'Llovizna ligera',weather53:'Llovizna',weather55:'Llovizna intensa',weather61:'Lluvia ligera',weather63:'Lluvia',weather65:'Lluvia intensa',weather71:'Nieve ligera',weather73:'Nieve',weather75:'Nieve intensa',weather80:'Chubascos',weather81:'Chubascos',weather82:'Chubascos intensos',weather85:'Chubascos de nieve',weather86:'Nevadas intensas',weather95:'Tormenta',weather96:'Tormenta con granizo',weather99:'Tormenta severa con granizo',weatherUnknown:'Clima'
  },
  ar: {
    appTitle:'عقدة الإغاثة', appSubtitle:'مركز محلي للاستجابة للطوارئ والمناخ', languageLabel:'اللغة', adminMode:'وضع المسؤول', adminIncorrect:'رمز المسؤول غير صحيح.', connecting:'جارٍ الاتصال…', online:'العقدة المحلية متصلة', reconnecting:'إعادة الاتصال…',
    latestNotice:'أحدث إشعار', loading:'جارٍ التحميل…', connectingToNode:'جارٍ الاتصال بعقدة الإغاثة.', loadingModel:'جارٍ تحميل معلومات النموذج…', localFirst:'توصيل محلي أولاً', updated:'تم التحديث', safeStatus:'آمن', alertStatus:'تنبيه', emergencyStatus:'طوارئ',
    climateLog:'سجل المناخ والتنبيهات العامة', locationNotConfigured:'لم يتم إعداد الموقع', organizerSetLocation:'يمكن للمسؤول إعداد الموقع أدناه.', offlineReady:'جاهز دون اتصال', onlineDataCached:'تم حفظ البيانات المتصلة', partialData:'بيانات جزئية', logged:'تم التسجيل',
    temperature:'درجة الحرارة', condition:'الحالة', humidity:'الرطوبة', wind:'الرياح', precipitation:'الهطول', today:'اليوم', precipShort:'هطول', publicAlerts:'تنبيهات الطوارئ والطقس العامة', publicAlertsHelp:'يتم الاحتفاظ بنص المصدر الرسمي كما ورد.', active:'نشط', noAlertData:'لا توجد تنبيهات نشطة مخزنة لهذا الموقع.', climateHistory:'سجل المناخ', time:'الوقت', tempShort:'الحرارة', alerts:'التنبيهات',
    checkinLabel:'تسجيل حالة المجتمع', howAreYou:'كيف حالك؟', checkinPrivacy:'يتم حفظ تسجيل حالتك محليًا على عقدة الإغاثة.', nameLabel:'الاسم أو المعرّف', noteLabel:'ملاحظة قصيرة', optional:'اختياري', notePlaceholder:'مثال: الغرفة 4، أحتاج ماء', safeButton:'أنا بخير', helpButton:'أحتاج مساعدة', suppliesButton:'أحتاج مستلزمات',
    localSummary:'الملخص المحلي', total:'الإجمالي', needHelp:'يحتاجون مساعدة', suppliesStatus:'مستلزمات',
    organizer:'المسؤول', emergencyControls:'عناصر تحكم الطوارئ', adminLocked:'مقفل', adminVerified:'تم التحقق', organizerPin:'رمز المسؤول', pinPlaceholder:'أدخل الرمز', unlock:'فتح', lock:'قفل', composeNotice:'إنشاء إشعار طوارئ', noticeTitleLabel:'عنوان الإشعار', noticeTitlePlaceholder:'تنبيه جوي', sourceInstructions:'التعليمات / الإشعار الأصلي', instructionsPlaceholder:'أدخل تعليمات طوارئ موثقة.',
    aiAssist:'مساعدة الذكاء الاصطناعي على الجهاز', local:'محلي', makeActionCard:'إنشاء بطاقة إجراءات قصيرة', targetLanguage:'اللغة المستهدفة', languageNamePlaceholder:'اكتب أي لغة', translateDraft:'ترجمة المسودة', translationReady:'الترجمة جاهزة', translatingTo:'جارٍ الترجمة إلى {language}…', translationComplete:'اكتملت الترجمة — راجع المسودة قبل النشر.', translationFailed:'فشلت الترجمة. تحقّق من النموذج المحلي وحاول مرة أخرى.', aiDraftSafety:'ينشئ الذكاء الاصطناعي مسودات محليًا. لا يتم نشر شيء حتى يوافق المسؤول.', severity:'درجة الخطورة', safeNormal:'آمن / طبيعي', approvePublish:'الموافقة ونشر الإشعار', boardSafe:'اللوحة آمنة', boardAlert:'تنبيه اللوحة', boardEmergency:'طوارئ اللوحة', clearCheckins:'مسح التسجيلات',
    climateSettings:'إعدادات المناخ', publicDataSetup:'إعداد مسجل البيانات العامة', locationLabel:'اسم الموقع', locationPlaceholder:'المركز المجتمعي', latitude:'خط العرض', longitude:'خط الطول', usePhoneLocation:'استخدام موقع هذا الهاتف', units:'الوحدات', saveFetch:'حفظ وجلب', refreshNow:'تحديث الآن', climateSourceHelp:'الطقس: Open-Meteo. تنبيهات الولايات المتحدة: National Weather Service. تبقى آخر بيانات ناجحة محفوظة محليًا.',
    onDeviceGenAI:'ذكاء اصطناعي توليدي على الجهاز', localLlmStatus:'حالة النموذج المحلي', configured:'مُعد', ready:'الذكاء المحلي جاهز', needsAttention:'النموذج المحلي يحتاج إلى فحص', localLlmHelp:'يعمل النموذج على UNO Q نفسه. لا يحتاج إلى مفتاح API أو الإنترنت بعد التنزيل الأول.', testLocalAi:'اختبار الذكاء المحلي',
    needsClustering:'تجميع الاحتياجات', noCommunityNeeds:'لا توجد احتياجات مجتمعية بعد.', recentCheckins:'أحدث التسجيلات', noCheckins:'لا توجد تسجيلات بعد.', offlineHotspot:'نقطة اتصال دون إنترنت', standaloneNetwork:'وضع الشبكة المستقلة', hotspotHelp:'شغّل البرنامج النصي المرفق من سطر أوامر UNO Q وليس من App Lab.', aiDisclaimer:'قد تكون الملخصات والترجمات التي يولدها الذكاء الاصطناعي غير دقيقة أو غير مكتملة أحيانًا. تحقّق دائمًا من معلومات الطوارئ المهمة قبل اتخاذ إجراء أو نشرها.',
    urgent_help:'مساعدة عاجلة', medical:'طبي', water:'ماء', food:'غذاء', shelter:'مأوى', power:'طاقة / شحن', transport:'نقل', supplies_other:'مستلزمات أخرى', helpBadge:'مساعدة', suppliesBadge:'مستلزمات', safeBadge:'آمن',
    noInstructions:'لم يتم نشر تعليمات.', locationSaved:'تم حفظ الموقع. اضغط تحديث الآن عند توفر الإنترنت.', phoneGeoUnavailable:'هذا المتصفح لا يوفر تحديد الموقع.', phoneCoordsFilled:'تم ملء إحداثيات الهاتف. اضغط حفظ وجلب.', clearConfirm:'هل تريد مسح جميع التسجيلات المخزنة؟',
    aiFallback:'فشل النموذج المحلي سابقًا؛ سيستخدم التلخيص البديل دون اتصال حتى يصبح النموذج متاحًا.', aiConfigured:'ينشئ الذكاء الاصطناعي مسودات محليًا. لا يتم نشر شيء حتى يوافق المسؤول.',
    weather0:'صافٍ',weather1:'صافٍ غالبًا',weather2:'غائم جزئيًا',weather3:'غائم',weather45:'ضباب',weather48:'ضباب متجمد',weather51:'رذاذ خفيف',weather53:'رذاذ',weather55:'رذاذ كثيف',weather61:'مطر خفيف',weather63:'مطر',weather65:'مطر غزير',weather71:'ثلج خفيف',weather73:'ثلج',weather75:'ثلج كثيف',weather80:'زخات مطر',weather81:'زخات مطر',weather82:'زخات غزيرة',weather85:'زخات ثلج',weather86:'زخات ثلج كثيفة',weather95:'عاصفة رعدية',weather96:'عاصفة رعدية مع برد',weather99:'عاصفة رعدية شديدة مع برد',weatherUnknown:'الطقس'
  },
  hi: {
    appTitle:'रिलीफ नोड', appSubtitle:'स्थानीय आपातकाल और जलवायु प्रतिक्रिया केंद्र', languageLabel:'भाषा', adminMode:'एडमिन मोड', adminIncorrect:'आयोजक PIN गलत है।', connecting:'कनेक्ट हो रहा है…', online:'स्थानीय नोड ऑनलाइन', reconnecting:'फिर से कनेक्ट हो रहा है…',
    latestNotice:'नवीनतम सूचना', loading:'लोड हो रहा है…', connectingToNode:'रिलीफ नोड से कनेक्ट हो रहा है।', loadingModel:'मॉडल जानकारी लोड हो रही है…', localFirst:'लोकल-फर्स्ट डिलीवरी', updated:'अपडेट', safeStatus:'सुरक्षित', alertStatus:'अलर्ट', emergencyStatus:'आपातकाल',
    climateLog:'जलवायु और सार्वजनिक अलर्ट लॉग', locationNotConfigured:'स्थान सेट नहीं है', organizerSetLocation:'आयोजक नीचे स्थान सेट कर सकता है।', offlineReady:'ऑफलाइन तैयार', onlineDataCached:'ऑनलाइन डेटा सहेजा गया', partialData:'आंशिक डेटा', logged:'लॉग किया गया',
    temperature:'तापमान', condition:'स्थिति', humidity:'नमी', wind:'हवा', precipitation:'वर्षा', today:'आज', precipShort:'वर्षा', publicAlerts:'सार्वजनिक आपातकाल/मौसम अलर्ट', publicAlertsHelp:'आधिकारिक स्रोत का पाठ जैसा मिला है वैसा ही रखा जाता है।', active:'सक्रिय', noAlertData:'इस स्थान के लिए कोई सक्रिय अलर्ट संग्रहीत नहीं है।', climateHistory:'जलवायु लॉग इतिहास', time:'समय', tempShort:'तापमान', alerts:'अलर्ट',
    checkinLabel:'समुदाय चेक-इन', howAreYou:'आप कैसे हैं?', checkinPrivacy:'आपका चेक-इन इस रिलीफ नोड पर स्थानीय रूप से सहेजा जाता है।', nameLabel:'नाम या पहचान', noteLabel:'छोटा नोट', optional:'वैकल्पिक', notePlaceholder:'जैसे कमरा 4, पानी चाहिए', safeButton:'मैं सुरक्षित हूँ', helpButton:'मुझे मदद चाहिए', suppliesButton:'मुझे सामान चाहिए',
    localSummary:'स्थानीय सारांश', total:'कुल', needHelp:'मदद चाहिए', suppliesStatus:'सामान',
    organizer:'आयोजक', emergencyControls:'आपातकाल नियंत्रण', adminLocked:'लॉक', adminVerified:'सत्यापित', organizerPin:'आयोजक PIN', pinPlaceholder:'PIN दर्ज करें', unlock:'अनलॉक', lock:'लॉक', composeNotice:'आपातकाल सूचना बनाएँ', noticeTitleLabel:'सूचना शीर्षक', noticeTitlePlaceholder:'मौसम अलर्ट', sourceInstructions:'मूल निर्देश / सूचना', instructionsPlaceholder:'सत्यापित आपातकाल निर्देश दर्ज करें।',
    aiAssist:'ऑन-डिवाइस AI सहायता', local:'लोकल', makeActionCard:'छोटा एक्शन कार्ड बनाएँ', targetLanguage:'लक्षित भाषा', languageNamePlaceholder:'कोई भी भाषा लिखें', translateDraft:'ड्राफ्ट अनुवाद करें', translationReady:'अनुवाद तैयार', translatingTo:'{language} में अनुवाद हो रहा है…', translationComplete:'अनुवाद पूरा हुआ — प्रकाशित करने से पहले ड्राफ्ट की समीक्षा करें।', translationFailed:'अनुवाद विफल रहा। स्थानीय मॉडल जाँचें और फिर प्रयास करें।', aiDraftSafety:'GenAI स्थानीय रूप से ड्राफ्ट बनाता है। आयोजक की मंजूरी के बिना कुछ प्रकाशित नहीं होता।', severity:'गंभीरता', safeNormal:'सुरक्षित / सामान्य', approvePublish:'मंजूर करें और प्रकाशित करें', boardSafe:'बोर्ड सुरक्षित', boardAlert:'बोर्ड अलर्ट', boardEmergency:'बोर्ड आपातकाल', clearCheckins:'चेक-इन साफ़ करें',
    climateSettings:'जलवायु सेटिंग्स', publicDataSetup:'सार्वजनिक डेटा लॉगर सेटअप', locationLabel:'स्थान नाम', locationPlaceholder:'सामुदायिक केंद्र', latitude:'अक्षांश', longitude:'देशांतर', usePhoneLocation:'इस फोन का स्थान उपयोग करें', units:'इकाइयाँ', saveFetch:'सहेजें और प्राप्त करें', refreshNow:'अभी रिफ्रेश करें', climateSourceHelp:'मौसम: Open-Meteo. U.S. अलर्ट: National Weather Service. अंतिम सफल डेटा स्थानीय रूप से कैश रहता है।',
    onDeviceGenAI:'ऑन-डिवाइस GenAI', localLlmStatus:'स्थानीय LLM स्थिति', configured:'कॉन्फ़िगर किया गया', ready:'स्थानीय GenAI तैयार', needsAttention:'स्थानीय मॉडल को ध्यान चाहिए', localLlmHelp:'मॉडल UNO Q पर ही चलता है। एक बार मॉडल डाउनलोड होने के बाद API key या इंटरनेट की जरूरत नहीं होती।', testLocalAi:'स्थानीय AI टेस्ट करें',
    needsClustering:'जरूरतों का समूह', noCommunityNeeds:'अभी कोई सामुदायिक जरूरत नहीं है।', recentCheckins:'हाल के चेक-इन', noCheckins:'अभी कोई चेक-इन नहीं है।', offlineHotspot:'ऑफलाइन हॉटस्पॉट', standaloneNetwork:'स्वतंत्र नेटवर्क मोड', hotspotHelp:'शामिल स्क्रिप्ट UNO Q शेल से चलाएँ, App Lab से नहीं।', aiDisclaimer:'एआई द्वारा तैयार किए गए सारांश और अनुवाद कभी-कभी अधूरे या गलत हो सकते हैं। कार्रवाई करने या प्रकाशित करने से पहले महत्वपूर्ण आपातकालीन जानकारी हमेशा सत्यापित करें।',
    urgent_help:'तुरंत मदद', medical:'चिकित्सा', water:'पानी', food:'खाना', shelter:'आश्रय', power:'बिजली / चार्जिंग', transport:'परिवहन', supplies_other:'अन्य सामान', helpBadge:'मदद', suppliesBadge:'सामान', safeBadge:'सुरक्षित',
    noInstructions:'कोई निर्देश प्रकाशित नहीं हुए हैं।', locationSaved:'स्थान सहेजा गया। इंटरनेट उपलब्ध होने पर अभी रिफ्रेश करें।', phoneGeoUnavailable:'यह ब्राउज़र जियोलोकेशन उपलब्ध नहीं कराता।', phoneCoordsFilled:'फोन के निर्देशांक भर दिए गए हैं। सहेजें और प्राप्त करें दबाएँ।', clearConfirm:'सभी संग्रहीत चेक-इन साफ़ करें?',
    aiFallback:'स्थानीय मॉडल पहले विफल हुआ था; मॉडल उपलब्ध होने तक सारांश ऑफलाइन नियम-आधारित बैकअप का उपयोग करेगा।', aiConfigured:'GenAI स्थानीय रूप से ड्राफ्ट बनाता है। आयोजक की मंजूरी के बिना कुछ प्रकाशित नहीं होता।',
    weather0:'साफ़',weather1:'अधिकतर साफ़',weather2:'आंशिक बादल',weather3:'बादल',weather45:'कोहरा',weather48:'जमा हुआ कोहरा',weather51:'हल्की बूंदाबांदी',weather53:'बूंदाबांदी',weather55:'तेज़ बूंदाबांदी',weather61:'हल्की बारिश',weather63:'बारिश',weather65:'तेज़ बारिश',weather71:'हल्की बर्फ',weather73:'बर्फ',weather75:'तेज़ बर्फ',weather80:'बारिश की बौछार',weather81:'बारिश की बौछार',weather82:'तेज़ बारिश की बौछार',weather85:'बर्फ की बौछार',weather86:'तेज़ बर्फ की बौछार',weather95:'आंधी-तूफान',weather96:'ओलों के साथ तूफान',weather99:'तेज़ ओलों वाला तूफान',weatherUnknown:'मौसम'
  },
  fr: {
    appTitle:'Nœud de Secours', appSubtitle:'Centre local de réponse aux urgences et au climat', languageLabel:'Langue', adminMode:'Mode administrateur', adminIncorrect:'Le PIN organisateur est incorrect.', connecting:'Connexion…', online:'Nœud local en ligne', reconnecting:'Reconnexion…',
    latestNotice:'Dernier avis', loading:'Chargement…', connectingToNode:'Connexion au Nœud de Secours.', loadingModel:'Chargement des informations du modèle…', localFirst:'Diffusion locale prioritaire', updated:'Mis à jour', safeStatus:'Sûr', alertStatus:'Alerte', emergencyStatus:'Urgence',
    climateLog:'Journal climat et alertes publiques', locationNotConfigured:'Lieu non configuré', organizerSetLocation:'L’organisateur peut définir un lieu ci-dessous.', offlineReady:'Prêt hors ligne', onlineDataCached:'Données en ligne mises en cache', partialData:'Données partielles', logged:'Enregistré',
    temperature:'Température', condition:'Conditions', humidity:'Humidité', wind:'Vent', precipitation:'Précipitations', today:'Aujourd’hui', precipShort:'précip.', publicAlerts:'Alertes publiques d’urgence et météo', publicAlertsHelp:'Le texte officiel de la source est conservé tel quel.', active:'actives', noAlertData:'Aucune alerte active stockée pour ce lieu.', climateHistory:'Historique climatique', time:'Heure', tempShort:'Temp.', alerts:'Alertes',
    checkinLabel:'Pointage communautaire', howAreYou:'Comment allez-vous ?', checkinPrivacy:'Votre pointage est stocké localement sur ce Nœud de Secours.', nameLabel:'Nom ou identifiant', noteLabel:'Note courte', optional:'Facultatif', notePlaceholder:'ex. Salle 4, besoin d’eau', safeButton:'Je suis en sécurité', helpButton:'J’ai besoin d’aide', suppliesButton:'J’ai besoin de fournitures',
    localSummary:'Résumé local', total:'Total', needHelp:'Besoin d’aide', suppliesStatus:'Fournitures',
    organizer:'Organisateur', emergencyControls:'Commandes d’urgence', adminLocked:'Verrouillé', adminVerified:'Vérifié', organizerPin:'PIN organisateur', pinPlaceholder:'Saisir le PIN', unlock:'Déverrouiller', lock:'Verrouiller', composeNotice:'Rédiger un avis d’urgence', noticeTitleLabel:'Titre de l’avis', noticeTitlePlaceholder:'Alerte météo', sourceInstructions:'Instructions / avis source', instructionsPlaceholder:'Saisissez des instructions d’urgence vérifiées.',
    aiAssist:'Assistance IA embarquée', local:'LOCAL', makeActionCard:'Créer une fiche d’actions', targetLanguage:'Langue cible', languageNamePlaceholder:'Saisir n’importe quelle langue', translateDraft:'Traduire le brouillon', translationReady:'Traduction prête', translatingTo:'Traduction vers {language}…', translationComplete:'Traduction terminée — vérifiez le brouillon avant publication.', translationFailed:'La traduction a échoué. Vérifiez le modèle local et réessayez.', aiDraftSafety:'La GenAI crée des brouillons localement. Rien n’est publié avant validation de l’organisateur.', severity:'Gravité', safeNormal:'Sûr / normal', approvePublish:'Approuver et publier', boardSafe:'Carte sûre', boardAlert:'Carte en alerte', boardEmergency:'Carte en urgence', clearCheckins:'Effacer les pointages',
    climateSettings:'Paramètres climat', publicDataSetup:'Configuration du journal de données publiques', locationLabel:'Nom du lieu', locationPlaceholder:'Centre communautaire', latitude:'Latitude', longitude:'Longitude', usePhoneLocation:'Utiliser la position de ce téléphone', units:'Unités', saveFetch:'Enregistrer et récupérer', refreshNow:'Actualiser', climateSourceHelp:'Météo : Open-Meteo. Alertes U.S. : National Weather Service. Les dernières données valides restent en cache local.',
    onDeviceGenAI:'GenAI embarquée', localLlmStatus:'État du LLM local', configured:'Configuré', ready:'GenAI locale prête', needsAttention:'Le modèle local requiert une vérification', localLlmHelp:'Le modèle s’exécute directement sur l’UNO Q. Aucune clé API ni internet n’est requis après le téléchargement initial.', testLocalAi:'Tester l’IA locale',
    needsClustering:'Regroupement des besoins', noCommunityNeeds:'Aucun besoin communautaire pour le moment.', recentCheckins:'Pointages récents', noCheckins:'Aucun pointage pour le moment.', offlineHotspot:'Point d’accès hors ligne', standaloneNetwork:'Mode réseau autonome', hotspotHelp:'Exécutez le script inclus depuis le shell de l’UNO Q, pas depuis App Lab.', aiDisclaimer:'Les résumés et traductions générés par l’IA peuvent parfois être incomplets ou inexacts. Vérifiez toujours les informations d’urgence critiques avant d’agir ou de les publier.',
    urgent_help:'Aide urgente', medical:'Médical', water:'Eau', food:'Nourriture', shelter:'Hébergement', power:'Énergie / recharge', transport:'Transport', supplies_other:'Autres fournitures', helpBadge:'AIDE', suppliesBadge:'FOURNITURES', safeBadge:'SÛR',
    noInstructions:'Aucune instruction publiée.', locationSaved:'Lieu enregistré. Appuyez sur Actualiser quand internet est disponible.', phoneGeoUnavailable:'Ce navigateur ne fournit pas la géolocalisation.', phoneCoordsFilled:'Coordonnées du téléphone remplies. Appuyez sur Enregistrer et récupérer.', clearConfirm:'Effacer tous les pointages stockés ?',
    aiFallback:'Le modèle local a échoué précédemment ; les résumés utiliseront le mode de secours hors ligne jusqu’à ce que le modèle soit disponible.', aiConfigured:'La GenAI crée des brouillons localement. Rien n’est publié avant validation de l’organisateur.',
    weather0:'Dégagé',weather1:'Plutôt dégagé',weather2:'Partiellement nuageux',weather3:'Couvert',weather45:'Brouillard',weather48:'Brouillard givrant',weather51:'Bruine légère',weather53:'Bruine',weather55:'Forte bruine',weather61:'Pluie légère',weather63:'Pluie',weather65:'Forte pluie',weather71:'Neige légère',weather73:'Neige',weather75:'Forte neige',weather80:'Averses',weather81:'Averses',weather82:'Fortes averses',weather85:'Averses de neige',weather86:'Fortes averses de neige',weather95:'Orage',weather96:'Orage avec grêle',weather99:'Orage violent avec grêle',weatherUnknown:'Météo'
  }
};

function dict() { return TRANSLATIONS[currentLang] || TRANSLATIONS.en; }
function t(key) { return dict()[key] || TRANSLATIONS.en[key] || key; }

ui.on_connect(() => {
  hasEverConnected = true;
  connectionPill.className = 'status-chip online-chip';
  connectionPill.querySelector('span:last-child').textContent = t('online');
  ui.send_message('get_state', {});
});

ui.on_disconnect(() => {
  connectionPill.className = 'status-chip offline-chip';
  connectionPill.querySelector('span:last-child').textContent = t('reconnecting');
  setAdminVerified(false);
});

ui.on_message('state', renderState);
ui.on_message('result', data => showToast(data?.message || 'Done.', false));
ui.on_message('error', data => {
  showToast(data?.message || 'Something went wrong.', true);
  if (translationWorking) setTranslationStatus('error');
});
ui.on_message('admin_auth', data => {
  if (!data || data.request_id !== adminRequestId) return;
  setAdminVerified(Boolean(data.ok));
  if (!data.ok && data.explicit) showToast(t('adminIncorrect'), true);
});

ui.on_message('notice_translation', data => {
  if (!data) return;
  const key = `${data.notice_id}:${data.language}`;
  noticeTranslationPending.delete(key);
  if (data.ok) {
    noticeTranslationCache.set(key, { title: data.title || '', body: data.body || '' });
    if (lastState?.notice?.id === data.notice_id && currentLang === data.language) renderState(lastState);
  }
});

ui.on_message('ai_draft', data => {
  setTranslationStatus('ready');
  document.getElementById('adminBody').value = data?.text || '';
  document.getElementById('aiModeText').textContent = data?.message || 'Draft ready.';
  showToast(data?.message || 'Draft ready.', false);
});

ui.on_message('translation_draft', data => {
  if (data?.request_id && data.request_id !== translationRequestId) return;
  document.getElementById('adminBody').value = data?.text || '';
  setTranslationStatus('done');
  showToast(data?.message || t('translationComplete'), false);
});

ui.on_message('translation_status', data => {
  if (!data || (data.request_id && data.request_id !== translationRequestId)) return;
  const state = data.state || 'ready';
  if (state === 'working') setTranslationStatus('working', data.language || document.getElementById('translationLanguage').value);
  else if (state === 'done') setTranslationStatus('done');
  else if (state === 'error') setTranslationStatus('error');
  else setTranslationStatus('ready');
});

ui.on_message('ai_busy', data => {
  const busy = Boolean(data?.busy);
  ['summarizeButton','translateButton','testLocalAiButton'].forEach(id => document.getElementById(id).disabled = busy);
  if (busy && data?.message) {
    document.getElementById('aiModeText').textContent = data.message;
    showToast(data.message, false);
  }
});

document.getElementById('uiLanguage').addEventListener('change', event => setLanguage(event.target.value));

document.getElementById('verifyAdminButton').addEventListener('click', () => verifyAdmin(true));
document.getElementById('pinInput').addEventListener('input', () => {
  setAdminVerified(false);
  clearTimeout(adminVerifyTimer);
  const value = pin();
  if (value.length >= 4) adminVerifyTimer = setTimeout(() => verifyAdmin(false), 350);
});
document.getElementById('pinInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); verifyAdmin(true); }
});
document.getElementById('togglePinVisibility').addEventListener('click', () => {
  const input = document.getElementById('pinInput');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  document.querySelector('#togglePinVisibility .eye-open').hidden = !show;
  document.querySelector('#togglePinVisibility .eye-closed').hidden = show;
  updatePinVisibilityLabel();
  input.focus();
});
adminModePill.addEventListener('click', () => {
  const input = document.getElementById('pinInput');
  input.value = '';
  input.type = 'password';
  document.querySelector('#togglePinVisibility .eye-open').hidden = true;
  document.querySelector('#togglePinVisibility .eye-closed').hidden = false;
  updatePinVisibilityLabel();
  setAdminVerified(false);
});

document.querySelectorAll('.status-button').forEach(button => {
  button.addEventListener('click', () => ui.send_message('check_in', {
    name: document.getElementById('nameInput').value,
    note: document.getElementById('noteInput').value,
    status: button.dataset.status,
  }));
});

document.getElementById('publishButton').addEventListener('click', () => ui.send_message('publish_notice', {
  pin: pin(), title: document.getElementById('adminTitle').value,
  body: document.getElementById('adminBody').value,
  severity: document.getElementById('adminSeverity').value,
}));

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  ui.send_message('set_mode', { pin: pin(), severity: button.dataset.mode });
}));

document.getElementById('clearButton').addEventListener('click', () => {
  if (!confirm(t('clearConfirm'))) return;
  ui.send_message('clear_checkins', { pin: pin() });
});

document.getElementById('saveClimateButton').addEventListener('click', () => ui.send_message('save_climate_settings', {
  pin: pin(), location_name: document.getElementById('locationName').value,
  latitude: document.getElementById('latitudeInput').value,
  longitude: document.getElementById('longitudeInput').value,
  units: document.getElementById('unitsInput').value,
}));

document.getElementById('refreshClimateButton').addEventListener('click', () => ui.send_message('refresh_climate', { pin: pin() }));

document.getElementById('phoneLocationButton').addEventListener('click', () => {
  if (!navigator.geolocation) { showToast(t('phoneGeoUnavailable'), true); return; }
  navigator.geolocation.getCurrentPosition(
    position => {
      document.getElementById('latitudeInput').value = position.coords.latitude.toFixed(6);
      document.getElementById('longitudeInput').value = position.coords.longitude.toFixed(6);
      showToast(t('phoneCoordsFilled'), false);
    },
    err => showToast(err.message, true),
    { enableHighAccuracy:false, timeout:10000 }
  );
});

document.getElementById('summarizeButton').addEventListener('click', () => ui.send_message('ai_summarize', {
  pin: pin(), text: document.getElementById('adminBody').value,
}));

document.getElementById('translateButton').addEventListener('click', () => {
  const language = document.getElementById('translationLanguage').value;
  translationRequestId = `translate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  setTranslationStatus('working', language);
  ui.send_message('ai_translate', {
    pin: pin(), text: document.getElementById('adminBody').value, language, request_id: translationRequestId,
  });
});

document.getElementById('translationLanguage').addEventListener('change', () => {
  if (!translationWorking) setTranslationStatus('ready');
});
document.getElementById('adminBody').addEventListener('input', () => {
  if (!translationWorking) setTranslationStatus('ready');
});

document.getElementById('testLocalAiButton').addEventListener('click', () => ui.send_message('test_local_ai', { pin: pin() }));

function setTranslationStatus(state, language='') {
  const box = document.getElementById('translationStatus');
  const text = document.getElementById('translationStatusText');
  const icon = box?.querySelector('.translation-state-icon');
  const spinner = document.getElementById('translateButtonSpinner');
  const buttonIcon = document.getElementById('translateButtonIcon');
  if (!box || !text) return;

  translationWorking = state === 'working';
  box.className = `translation-status ${state}`;
  if (spinner) spinner.hidden = !translationWorking;
  if (buttonIcon) buttonIcon.hidden = translationWorking;

  if (state === 'working') {
    text.textContent = t('translatingTo').replace('{language}', language || document.getElementById('translationLanguage').value);
    if (icon) icon.textContent = '';
  } else if (state === 'done') {
    text.textContent = t('translationComplete');
    if (icon) icon.textContent = '✓';
  } else if (state === 'error') {
    text.textContent = t('translationFailed');
    if (icon) icon.textContent = '!';
  } else {
    text.textContent = t('translationReady');
    if (icon) icon.textContent = '●';
  }
}

function requestNoticeTranslation(notice) {
  if (!notice?.id || currentLang === 'en' || !ui?.socket?.connected) return;
  const key = `${notice.id}:${currentLang}`;
  if (noticeTranslationCache.has(key) || noticeTranslationPending.has(key)) return;
  noticeTranslationPending.add(key);
  ui.send_message('translate_notice_ui', { notice_id: notice.id, language: currentLang, request_id: key });
}

function updatePinVisibilityLabel() {
  const button = document.getElementById('togglePinVisibility');
  const input = document.getElementById('pinInput');
  if (!button || !input) return;
  const labels = PIN_VISIBILITY_LABELS[currentLang] || PIN_VISIBILITY_LABELS.en;
  const label = input.type === 'password' ? labels.show : labels.hide;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function pin() { return document.getElementById('pinInput').value; }

function verifyAdmin(explicit) {
  if (!pin()) { setAdminVerified(false); return; }
  adminRequestId = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  ui.send_message('verify_admin', { pin: pin(), request_id: adminRequestId, explicit: Boolean(explicit) });
}

function setAdminVerified(value) {
  adminVerified = value;
  adminModePill.hidden = !value;
  adminModePill.title = value ? t('lock') : '';
  adminInlineStatus.textContent = value ? t('adminVerified') : t('adminLocked');
  adminInlineStatus.classList.toggle('verified', value);
  document.body.classList.toggle('admin-active', value);
}

function setLanguage(lang) {
  currentLang = TRANSLATIONS[lang] ? lang : 'en';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('uiLanguage').value = currentLang;
  localStorage.setItem('relief-ui-language', currentLang);
  applyTranslations();
  updatePinVisibilityLabel();
  if (translationWorking) setTranslationStatus('working', document.getElementById('translationLanguage').value);
  else if (document.getElementById('translationStatus')?.classList.contains('done')) setTranslationStatus('done');
  else if (document.getElementById('translationStatus')?.classList.contains('error')) setTranslationStatus('error');
  else setTranslationStatus('ready');
  if (lastState) renderState(lastState);
  else connectionPill.querySelector('span:last-child').textContent = t('connecting');
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.dataset.i18n;
    if (t(key)) node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  adminModePill.title = adminVerified ? t('lock') : '';
  if (connectionPill?.querySelector('span:last-child')) {
    connectionPill.querySelector('span:last-child').textContent = ui?.socket?.connected ? t('online') : (hasEverConnected ? t('reconnecting') : t('connecting'));
  }
}

function renderState(state) {
  lastState = state;
  const notice = state?.notice || {};
  const counts = state?.counts || {};
  const checkins = state?.checkins || [];
  const settings = state?.settings || {};

  let displayNotice = notice;
  if (notice.id && currentLang !== 'en') {
    const key = `${notice.id}:${currentLang}`;
    const translated = noticeTranslationCache.get(key);
    if (translated) displayNotice = { ...notice, ...translated };
    else requestNoticeTranslation(notice);
  }
  document.getElementById('noticeTitle').textContent = displayNotice.title || t('latestNotice');
  document.getElementById('noticeBody').textContent = displayNotice.body || t('noInstructions');
  document.getElementById('noticeTime').textContent = notice.created_at ? `${t('updated')} ${formatTime(notice.created_at)}` : '';

  const severity = ['safe','alert','emergency'].includes(notice.severity) ? notice.severity : 'safe';
  document.getElementById('noticeCard').className = `panel notice-panel severity-${severity}`;
  const badge = document.getElementById('severityBadge');
  badge.textContent = ({safe:t('safeStatus'),alert:t('alertStatus'),emergency:t('emergencyStatus')})[severity];
  badge.className = `severity-badge badge-${severity}`;

  document.getElementById('countTotal').textContent = counts.total ?? 0;
  document.getElementById('countSafe').textContent = counts.safe ?? 0;
  document.getElementById('countHelp').textContent = counts.help ?? 0;
  document.getElementById('countSupplies').textContent = counts.supplies ?? 0;

  if (document.activeElement !== document.getElementById('locationName')) document.getElementById('locationName').value = settings.location_name || '';
  if (document.activeElement !== document.getElementById('latitudeInput')) document.getElementById('latitudeInput').value = settings.latitude || '';
  if (document.activeElement !== document.getElementById('longitudeInput')) document.getElementById('longitudeInput').value = settings.longitude || '';
  document.getElementById('unitsInput').value = settings.units || 'F';

  const ai = state?.ai || {};
  const aiError = ai.last_error || '';
  document.getElementById('localAiModel').textContent = ai.model || 'Local model';
  document.getElementById('localAiStatus').textContent = aiError ? t('needsAttention') : (ai.initialized ? t('ready') : t('configured'));
  document.getElementById('aiModeText').textContent = aiError ? t('aiFallback') : t('aiConfigured');

  renderClimate(state?.climate || {}, settings);
  renderNeeds(state?.needs_summary || []);
  renderCheckins(checkins);
  setAdminVerified(adminVerified);
}

function renderClimate(climate, settings) {
  const latest = climate?.latest;
  const alerts = climate?.alerts || [];
  const history = climate?.history || [];
  const units = latest?.units || settings?.units || 'F';

  document.getElementById('climateLocation').textContent = latest?.location_name || settings?.location_name || t('locationNotConfigured');

  if (!latest) {
    document.getElementById('climateStatus').textContent = settings?.latitude ? t('locationSaved') : t('organizerSetLocation');
    document.getElementById('climateSourceBadge').textContent = t('offlineReady');
    setText('temperatureValue','—'); setText('temperatureUnit',''); setText('conditionValue','—'); setText('humidityValue','—'); setText('windValue','—'); setText('precipValue','—'); setText('forecastValue','—');
  } else {
    document.getElementById('climateStatus').textContent = `${t('logged')} ${formatTime(latest.created_at)} • ${(latest.source_status || '').startsWith('ok') ? t('onlineDataCached') : t('partialData')}`;
    document.getElementById('climateSourceBadge').textContent = (latest.source_status || '').startsWith('ok') ? t('onlineDataCached') : t('partialData');
    setText('temperatureValue', number(latest.temperature)); setText('temperatureUnit', `°${units}`);
    setText('conditionValue', weatherLabel(latest.weather_code));
    setText('humidityValue', latest.humidity == null ? '—' : `${number(latest.humidity)}%`);
    setText('windValue', latest.wind_speed == null ? '—' : `${number(latest.wind_speed)} ${units === 'F' ? 'mph' : 'km/h'}`);
    setText('precipValue', latest.precipitation == null ? '—' : `${number(latest.precipitation)} ${units === 'F' ? 'in' : 'mm'}`);
    const high = latest.high_temperature == null ? '—' : number(latest.high_temperature);
    const low = latest.low_temperature == null ? '—' : number(latest.low_temperature);
    const pop = latest.precipitation_probability == null ? '—' : `${number(latest.precipitation_probability)}%`;
    setText('forecastValue', `${low}–${high}° • ${pop} ${t('precipShort')}`);
  }

  document.getElementById('alertCount').textContent = `${alerts.length} ${t('active')}`;
  const alertBox = document.getElementById('publicAlerts');
  alertBox.innerHTML = '';
  if (!alerts.length) {
    const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = t('noAlertData'); alertBox.appendChild(p);
  } else {
    for (const alert of alerts) {
      const item = document.createElement('div'); item.className = `public-alert severity-${String(alert.severity || '').toLowerCase()}`;
      const heading = document.createElement('strong'); heading.textContent = alert.headline || alert.event;
      const meta = document.createElement('div'); meta.className = 'alert-meta'; meta.textContent = `${alert.severity || ''}${alert.expires ? ` • ${formatTime(alert.expires)}` : ''}`;
      item.append(heading, meta);
      if (alert.instruction) { const p = document.createElement('p'); p.textContent = alert.instruction; item.appendChild(p); }
      alertBox.appendChild(item);
    }
  }

  const tbody = document.getElementById('climateHistory'); tbody.innerHTML = '';
  for (const row of history) {
    const tr = document.createElement('tr'); const rowUnits = row.units || units;
    [formatTime(row.created_at), row.temperature == null ? '—' : `${number(row.temperature)}°${rowUnits}`, row.humidity == null ? '—' : `${number(row.humidity)}%`, row.wind_speed == null ? '—' : `${number(row.wind_speed)} ${rowUnits === 'F' ? 'mph' : 'km/h'}`, row.alert_count ?? 0].forEach(value => {
      const td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function renderNeeds(groups) {
  const container = document.getElementById('needsSummary');
  if (!groups.length) { container.innerHTML = ''; const p=document.createElement('p'); p.className='empty-state'; p.textContent=t('noCommunityNeeds'); container.appendChild(p); return; }
  container.innerHTML = '';
  for (const group of groups) {
    const row = document.createElement('div'); row.className = `need-group need-${group.key}`;
    const header = document.createElement('div'); header.className = 'need-header';
    const title = document.createElement('strong'); title.textContent = t(group.key) || group.label;
    const count = document.createElement('span'); count.className = 'count-badge'; count.textContent = group.count;
    header.append(title, count); row.appendChild(header);
    const examples = document.createElement('div'); examples.className = 'need-examples';
    examples.textContent = (group.examples || []).map(x => `${x.name}${x.note ? ` — ${x.note}` : ''}`).join(' • ');
    row.appendChild(examples); container.appendChild(row);
  }
}

function renderCheckins(items) {
  const container = document.getElementById('checkinList');
  if (!items.length) { container.innerHTML=''; const p=document.createElement('p'); p.className='empty-state'; p.textContent=t('noCheckins'); container.appendChild(p); return; }
  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div'); row.className = `checkin-row checkin-${item.status}`;
    const top = document.createElement('div'); top.className = 'checkin-top';
    const name = document.createElement('strong'); name.textContent = item.name;
    const badge = document.createElement('span'); badge.className = 'mini-badge'; badge.textContent = ({safe:t('safeBadge'),help:t('helpBadge'),supplies:t('suppliesBadge')})[item.status] || item.status;
    top.append(name,badge); row.appendChild(top);
    if (item.note) { const note=document.createElement('div'); note.className='checkin-note'; note.textContent=item.note; row.appendChild(note); }
    const time=document.createElement('div'); time.className='checkin-time'; time.textContent=formatTime(item.created_at); row.appendChild(time); container.appendChild(row);
  }
}

function weatherLabel(code) {
  if (code == null) return '—';
  const key = `weather${code}`;
  return dict()[key] || TRANSLATIONS.en[key] || `${t('weatherUnknown')} ${code}`;
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function number(value) { const n=Number(value); if (!Number.isFinite(n)) return '—'; return Math.abs(n)>=100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/,''); }
function formatTime(iso) {
  const date = new Date(iso); if (Number.isNaN(date.getTime())) return iso || '';
  const locale = LANG_LOCALES[currentLang] || 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
  } catch (_) {
    return date.toLocaleString(locale, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
}

let toastTimer;
function showToast(message, isError) {
  clearTimeout(toastTimer); toast.hidden=false; toast.textContent=message; toast.className=isError?'toast error':'toast success';
  toastTimer=setTimeout(()=>{toast.hidden=true;},4500);
}

setLanguage(currentLang);
setAdminVerified(false);
updatePinVisibilityLabel();
setTranslationStatus('ready');
setInterval(() => { if (ui?.socket?.connected) ui.send_message('get_state', {}); }, 60000);
