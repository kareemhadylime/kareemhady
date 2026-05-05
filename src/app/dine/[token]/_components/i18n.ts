// Static UI string dictionary for the guest /dine pages. Menu content
// (categories, items, modifiers) is localized via DB columns
// (name_en/ar/ru/fr, description_en/ar/ru/fr); this file only covers
// chrome strings hardcoded in the React tree.

export type DineLang = 'en' | 'ar' | 'ru' | 'fr';

type Dict = Record<DineLang, string>;

export const t: Record<string, Dict> = {
  in_room_dining: {
    en: 'IN-ROOM DINING',
    ar: 'خدمة الطعام في الغرفة',
    ru: 'ЗАКАЗ В НОМЕР',
    fr: 'SERVICE EN CHAMBRE',
  },
  welcome_name: {
    en: 'Welcome, {name}',
    ar: 'أهلاً بك، {name}',
    ru: 'Здравствуйте, {name}',
    fr: 'Bienvenue, {name}',
  },
  building_unit: {
    en: '{building} · Unit {unit}',
    ar: '{building} · وحدة {unit}',
    ru: '{building} · Номер {unit}',
    fr: '{building} · Unité {unit}',
  },
  available_daily: {
    en: 'Available daily from {start} – {end}',
    ar: 'متاح يومياً من {start} – {end}',
    ru: 'Доступно ежедневно с {start} до {end}',
    fr: 'Disponible tous les jours de {start} à {end}',
  },
  vat_service_line: {
    en: 'All prices are inclusive of 14% VAT & 12% Service Charge',
    ar: 'جميع الأسعار شاملة 14% ضريبة قيمة مضافة و12% خدمة',
    ru: 'Все цены включают НДС 14% и сервисный сбор 12%',
    fr: 'Tous les prix incluent 14% de TVA et 12% de service',
  },
  unavailable: {
    en: 'Unavailable',
    ar: 'غير متوفر',
    ru: 'Недоступно',
    fr: 'Indisponible',
  },
  service_unavailable_title: {
    en: 'Service unavailable',
    ar: 'الخدمة غير متاحة',
    ru: 'Сервис недоступен',
    fr: 'Service indisponible',
  },
  not_checked_in: {
    en: 'Available once you check in.',
    ar: 'متاح بعد تسجيل الوصول.',
    ru: 'Будет доступно после заезда.',
    fr: 'Disponible après votre arrivée.',
  },
  building_disabled: {
    en: 'In-room dining is not available at this property.',
    ar: 'خدمة الطعام في الغرفة غير متاحة في هذا العقار.',
    ru: 'Заказ в номер недоступен в этом объекте.',
    fr: 'Le service en chambre n’est pas disponible dans cette propriété.',
  },
  contact_reception: {
    en: 'Please contact reception by dialling 0 from your living room.',
    ar: 'يرجى الاتصال بالاستقبال عبر الرقم 0 من غرفة المعيشة.',
    ru: 'Пожалуйста, свяжитесь с рецепцией, набрав 0 из гостиной.',
    fr: 'Veuillez contacter la réception en composant le 0 depuis le salon.',
  },
};

export function tr(key: keyof typeof t, lang: DineLang, vars: Record<string, string | number> = {}): string {
  const template = t[key]?.[lang] ?? t[key]?.en ?? '';
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Numeral localization. AR mode uses Eastern Arabic / Hindi digits
// (٠١٢٣٤٥٦٧٨٩) per Egyptian convention; EN/RU/FR keep Latin digits.
const EASTERN_ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

export function formatNumber(n: number | string, lang: DineLang): string {
  const s = typeof n === 'number' ? String(n) : n;
  if (lang !== 'ar') return s;
  return s.replace(/\d/g, d => EASTERN_ARABIC_DIGITS[parseInt(d, 10)]);
}

// Prices stay in USD across the menu. AR localizes the digits and puts
// the symbol after the number with a non-breaking space (Egyptian retail
// convention). Other langs keep the leading $.
export function formatPrice(usd: number, lang: DineLang, opts: { signed?: boolean } = {}): string {
  const sign = opts.signed && usd > 0 ? '+' : opts.signed && usd < 0 ? '−' : '';
  const abs = Math.abs(usd);
  const integer = abs % 1 === 0;
  const formatted = integer ? abs.toFixed(0) : abs.toFixed(2);
  if (lang === 'ar') {
    return `${sign}${formatNumber(formatted, 'ar')} $`;
  }
  return `${sign}$${formatted}`;
}

export function formatTime(hhmm: string, lang: DineLang): string {
  return formatNumber(hhmm, lang);
}

// Additional UI strings used by the item bottom-sheet.
export const sheetT: Record<string, Dict> = {
  add_ons: {
    en: 'Add-ons',
    ar: 'إضافات',
    ru: 'Дополнения',
    fr: 'Suppléments',
  },
  quantity: {
    en: 'Quantity',
    ar: 'الكمية',
    ru: 'Количество',
    fr: 'Quantité',
  },
  notes_optional: {
    en: 'Notes (optional)',
    ar: 'ملاحظات (اختيارية)',
    ru: 'Примечания (необязательно)',
    fr: 'Notes (facultatif)',
  },
  notes_placeholder: {
    en: 'No onions, extra sauce, …',
    ar: 'بدون بصل، صلصة إضافية، …',
    ru: 'Без лука, дополнительный соус, …',
    fr: 'Sans oignons, sauce en plus, …',
  },
  cancel: {
    en: 'Cancel',
    ar: 'إلغاء',
    ru: 'Отмена',
    fr: 'Annuler',
  },
  add_to_order: {
    en: 'Add to order · {price}',
    ar: 'أضف إلى الطلب · {price}',
    ru: 'Добавить · {price}',
    fr: 'Ajouter · {price}',
  },
};

export function trSheet(key: keyof typeof sheetT, lang: DineLang, vars: Record<string, string | number> = {}): string {
  const template = sheetT[key]?.[lang] ?? sheetT[key]?.en ?? '';
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

// Order confirmation + status surface strings.
export const orderT: Record<string, Dict> = {
  status_submitted: {
    en: '🛎  Order received',
    ar: '🛎  تم استلام طلبك',
    ru: '🛎  Заказ получен',
    fr: '🛎  Commande reçue',
  },
  status_preparing: {
    en: '👨‍🍳  Preparing',
    ar: '👨‍🍳  قيد التحضير',
    ru: '👨‍🍳  Готовится',
    fr: '👨‍🍳  En préparation',
  },
  status_ready: {
    en: '✅  Ready',
    ar: '✅  جاهز',
    ru: '✅  Готов',
    fr: '✅  Prêt',
  },
  status_delivered: {
    en: '🍽  Delivered',
    ar: '🍽  تم التسليم',
    ru: '🍽  Доставлен',
    fr: '🍽  Livré',
  },
  status_cancelled: {
    en: '✗  Cancelled',
    ar: '✗  ملغى',
    ru: '✗  Отменён',
    fr: '✗  Annulée',
  },
  thanks_for_order: {
    en: 'Thanks for your order!',
    ar: 'شكراً لطلبك!',
    ru: 'Спасибо за ваш заказ!',
    fr: 'Merci pour votre commande !',
  },
  enjoy_meal_shortly: {
    en: 'You will enjoy your meal shortly.',
    ar: 'ستستمتع بوجبتك قريباً.',
    ru: 'Вы скоро насладитесь вашей едой.',
    fr: 'Vous savourerez votre repas sous peu.',
  },
  returning_in: {
    en: 'Returning to the menu in {n}s',
    ar: 'العودة إلى القائمة خلال {n} ث',
    ru: 'Возврат в меню через {n} с',
    fr: 'Retour au menu dans {n} s',
  },
  stay_on_page: {
    en: 'Stay on this page',
    ar: 'البقاء في هذه الصفحة',
    ru: 'Остаться на странице',
    fr: 'Rester sur cette page',
  },
  expected_by: {
    en: 'Expected by {time}',
    ar: 'متوقع بحلول {time}',
    ru: 'Ожидается к {time}',
    fr: 'Prévu pour {time}',
  },
  order_number: {
    en: 'Order #{n}',
    ar: 'الطلب رقم {n}',
    ru: 'Заказ №{n}',
    fr: 'Commande N° {n}',
  },
  total: {
    en: 'Total',
    ar: 'الإجمالي',
    ru: 'Итого',
    fr: 'Total',
  },
  charged_to_room: {
    en: 'Charged to your room — settled at checkout.',
    ar: 'يُحتسب على غرفتك — يُسوّى عند تسجيل المغادرة.',
    ru: 'Списывается на номер — оплата при выезде.',
    fr: 'Facturé sur votre chambre — réglé au départ.',
  },
  cancel_remaining: {
    en: 'Cancel order ({n}s remaining)',
    ar: 'إلغاء الطلب (يتبقى {n} ث)',
    ru: 'Отменить заказ (осталось {n} с)',
    fr: 'Annuler la commande ({n} s restantes)',
  },
  cancel_confirm: {
    en: 'Cancel this order?',
    ar: 'هل تريد إلغاء هذا الطلب؟',
    ru: 'Отменить этот заказ?',
    fr: 'Annuler cette commande ?',
  },
  download_receipt: {
    en: 'Download receipt',
    ar: 'تحميل الإيصال',
    ru: 'Скачать чек',
    fr: 'Télécharger le reçu',
  },
  order_again: {
    en: 'Order again',
    ar: 'اطلب مرة أخرى',
    ru: 'Заказать снова',
    fr: 'Commander à nouveau',
  },
};

export function trOrder(key: keyof typeof orderT, lang: DineLang, vars: Record<string, string | number> = {}): string {
  const template = orderT[key]?.[lang] ?? orderT[key]?.en ?? '';
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
