/* Konsültasyon Defteri — seçenek katalogları.
 * Buradaki listeler uygulamadaki dokunmatik seçim butonlarını oluşturur.
 * Kullanıcının "+ Ekle" ile eklediği seçenekler cihazda ayrıca saklanır. */
(function () {
  'use strict';

  const WARDS = [
    'Acil', 'Dahiliye', 'Gastroenteroloji', 'Nefroloji', 'Hematoloji', 'Onkoloji',
    'Endokrinoloji', 'Romatoloji', 'Kardiyoloji', 'Göğüs Hst.', 'Nöroloji',
    'Genel Cerrahi', 'Ortopedi', 'Beyin Cerrahi', 'KVC', 'Göğüs Cerrahi', 'Üroloji',
    'KBB', 'Plastik Cerrahi', 'Kadın Doğum', 'FTR', 'Psikiyatri', 'Dermatoloji', 'Göz',
    'Pediatri', 'Palyatif', 'Dahiliye YB', 'Anestezi YB', 'Cerrahi YB', 'KVC YB',
    'Nöroloji YB', 'Koroner YB', 'Yenidoğan YB'
  ];

  const BEDS = ['A', 'B', 'C', 'D', '1', '2', '3', '4'];

  const REASON_GROUPS = [
    { t: 'Bulgu', items: ['Ateş', 'Ateş etiyolojisi (NBA)', 'Lökositoz', 'CRP/PCT yüksekliği', 'Sepsis şüphesi', 'İshal'] },
    { t: 'Odak', items: ['Pnömoni', 'VİP', 'İYE', 'Bakteriyemi', 'Kateter enfeksiyonu', 'Cerrahi alan enf.', 'Yara enfeksiyonu', 'Diyabetik ayak', 'Selülit / YDYE', 'Osteomiyelit', 'Septik artrit', 'Protez eklem enf.', 'İntraabdominal enf.', 'Menenjit / Ensefalit', 'Endokardit şüphesi', 'Febril nötropeni', 'C. difficile', 'Fungal enfeksiyon', 'Bası yarası enf.'] },
    { t: 'Mikrobiyoloji', items: ['Kültür üremesi', 'MDR kolonizasyon'] },
    { t: 'Antibiyotik', items: ['Antibiyotik onayı', 'Antibiyotik düzenleme', 'De-eskalasyon / kesme', 'IV→PO geçiş', 'Cerrahi profilaksi'] },
    { t: 'Viral / Seroloji', items: ['HBsAg pozitifliği', 'Anti-HCV pozitifliği', 'HIV', 'İmmünsupresyon öncesi (HBV)'] },
    { t: 'Diğer', items: ['Tüberküloz', 'Brusella', 'KKKA şüphesi', 'Kesici-delici yaralanma', 'İzolasyon önerisi', 'Aşılama', 'Taburculuk planı'] }
  ];

  const COMORB = [
    'DM', 'HT', 'KAH', 'KKY', 'KOAH / Astım', 'KBY', 'Hemodiyaliz', 'Periton diyalizi', 'Siroz',
    'Solid malignite', 'Hematolojik malignite', 'Kemoterapi', 'Nötropeni', 'Steroid',
    'İmmünsupresif / Biyolojik', 'Solid organ Tx', 'KİT', 'HIV', 'Splenektomi', 'SVO / Hemipleji',
    'Demans', 'Yatağa bağımlı', 'Obezite', 'Gebelik', 'Alkol / Madde', 'IV madde kullanımı',
    'Protez kalp kapağı', 'Pacemaker / ICD', 'Eklem protezi', 'Vasküler greft'
  ];

  const RISKS = [
    'Son 90 gün yatış', 'Son 90 gün antibiyotik', 'Bakımevi', 'Yakın zamanda cerrahi',
    'MDR kolonizasyon öyküsü', 'Yurt dışı seyahat', 'Hayvan teması', 'Çiğ süt ürünü', 'Kene tutunması'
  ];

  const ALLERGY = ['Penisilin', 'Sefalosporin', 'Karbapenem', 'Sülfonamid', 'Kinolon', 'Makrolid', 'Glikopeptid', 'Aminoglikozid'];

  const DEVICES = [
    'SVK', 'PICC', 'Port', 'HD kateteri', 'Arter kateteri', 'Periferik kateter', 'Üriner kateter',
    'Entübe / MV', 'Trakeostomi', 'NG sonda', 'PEG', 'Dren', 'Toraks tüpü', 'EVD / VP şant',
    'Nefrostomi', 'DJ stent', 'Biliyer stent', 'VAC', 'Eksternal fiksatör'
  ];

  // Demografi ve vital bulgular: k = anahtar, lo/hi = normal aralık (bant), def = başlangıç konumu
  const DEMO = {
    age: { label: 'Yaş', unit: 'yıl', min: 16, max: 105, step: 1, dec: 0, def: 60 },
    weight: { label: 'Kilo', unit: 'kg', min: 30, max: 200, step: 1, dec: 0, def: 70 },
    height: { label: 'Boy', unit: 'cm', min: 130, max: 210, step: 1, dec: 0, def: 170 }
  };

  const VITALS = [
    { k: 'temp', label: 'Ateş', unit: '°C', min: 34, max: 42, step: 0.1, dec: 1, def: 36.8, lo: 36, hi: 37.9 },
    { k: 'tmax', label: 'Son 24 saat maks. ateş', unit: '°C', min: 34, max: 42, step: 0.1, dec: 1, def: 37.5, lo: 36, hi: 37.9 },
    { k: 'hr', label: 'Nabız', unit: '/dk', min: 30, max: 200, step: 1, dec: 0, def: 85, lo: 50, hi: 100 },
    { k: 'sbp', label: 'Sistolik TA', unit: 'mmHg', min: 50, max: 240, step: 1, dec: 0, def: 120, lo: 101, hi: 159 },
    { k: 'dbp', label: 'Diastolik TA', unit: 'mmHg', min: 20, max: 140, step: 1, dec: 0, def: 70, lo: 50, hi: 99 },
    { k: 'rr', label: 'Solunum sayısı', unit: '/dk', min: 6, max: 50, step: 1, dec: 0, def: 16, lo: 12, hi: 21 },
    { k: 'spo2', label: 'SpO₂', unit: '%', min: 60, max: 100, step: 1, dec: 0, def: 96, lo: 92, hi: 100 },
    { k: 'gcs', label: 'Glasgow koma skoru', unit: '', min: 3, max: 15, step: 1, dec: 0, def: 15, lo: 15, hi: 15 }
  ];

  const O2 = ['Oda havası', 'Nazal kanül', 'Maske', 'Rezervuarlı maske', 'HFNC', 'NIMV', 'İMV'];
  const PRESSORS = ['Noradrenalin', 'Dopamin', 'Adrenalin', 'Dobutamin', 'Vazopressin'];
  const URINE = ['Normal', 'Oligüri', 'Anüri'];

  // Laboratuvar: lo/hi = erişkin referans aralığı (laboratuvarınıza göre değişebilir)
  const LAB_GROUPS = [
    { t: 'Hemogram', items: [
      { k: 'wbc', label: 'Lökosit', unit: '10³/µL', dec: 2, lo: 4, hi: 10 },
      { k: 'neu', label: 'Nötrofil', unit: '10³/µL', dec: 2, lo: 1.8, hi: 7 },
      { k: 'lym', label: 'Lenfosit', unit: '10³/µL', dec: 2, lo: 1, hi: 4 },
      { k: 'hb', label: 'Hemoglobin', unit: 'g/dL', dec: 1, lo: 12, hi: 17 },
      { k: 'plt', label: 'Trombosit', unit: '10³/µL', dec: 0, lo: 150, hi: 400 }
    ] },
    { t: 'İnflamasyon', items: [
      { k: 'crp', label: 'CRP', unit: 'mg/L', dec: 1, lo: 0, hi: 5 },
      { k: 'pct', label: 'Prokalsitonin', unit: 'ng/mL', dec: 2, lo: 0, hi: 0.5 },
      { k: 'esr', label: 'Sedim', unit: 'mm/sa', dec: 0, lo: 0, hi: 20 },
      { k: 'ferritin', label: 'Ferritin', unit: 'ng/mL', dec: 0, lo: 20, hi: 300 }
    ] },
    { t: 'Biyokimya', items: [
      { k: 'cr', label: 'Kreatinin', unit: 'mg/dL', dec: 2, lo: 0.6, hi: 1.2 },
      { k: 'ure', label: 'Üre', unit: 'mg/dL', dec: 0, lo: 17, hi: 43 },
      { k: 'ast', label: 'AST', unit: 'U/L', dec: 0, lo: 0, hi: 40 },
      { k: 'alt', label: 'ALT', unit: 'U/L', dec: 0, lo: 0, hi: 41 },
      { k: 'tbil', label: 'T. bilirubin', unit: 'mg/dL', dec: 2, lo: 0.3, hi: 1.2 },
      { k: 'alb', label: 'Albümin', unit: 'g/dL', dec: 1, lo: 3.5, hi: 5.2 },
      { k: 'na', label: 'Sodyum', unit: 'mmol/L', dec: 0, lo: 135, hi: 145 },
      { k: 'k', label: 'Potasyum', unit: 'mmol/L', dec: 1, lo: 3.5, hi: 5.1 },
      { k: 'glu', label: 'Glukoz', unit: 'mg/dL', dec: 0, lo: 70, hi: 110 },
      { k: 'lac', label: 'Laktat', unit: 'mmol/L', dec: 1, lo: 0.5, hi: 2 },
      { k: 'inr', label: 'INR', unit: '', dec: 2, lo: 0.8, hi: 1.2 }
    ] },
    { t: 'Diğer', items: [
      { k: 'ck', label: 'CK', unit: 'U/L', dec: 0, lo: 0, hi: 170 },
      { k: 'ddimer', label: 'D-dimer', unit: 'µg/mL', dec: 2, lo: 0, hi: 0.5 },
      { k: 'vanko', label: 'Vankomisin vadi', unit: 'µg/mL', dec: 1, lo: 10, hi: 20 },
      { k: 'csfwbc', label: 'BOS hücre', unit: '/mm³', dec: 0, lo: 0, hi: 5 },
      { k: 'csfpro', label: 'BOS protein', unit: 'mg/dL', dec: 0, lo: 15, hi: 45 },
      { k: 'csfglu', label: 'BOS glukoz', unit: 'mg/dL', dec: 0, lo: 40, hi: 80 }
    ] }
  ];

  const URINALYSIS = ['Normal', 'Lökosit esteraz (+)', 'Nitrit (+)', 'Piyüri', 'Hematüri', 'Bakteriüri', 'Maya'];

  const SAMPLES = [
    'Kan kültürü', 'İdrar kültürü', 'Balgam', 'Trakeal aspirat', 'BAL', 'Yara yeri', 'Derin doku / Kemik',
    'Apse / Pü', 'BOS', 'Kateter ucu', 'Plevral sıvı', 'Periton sıvısı', 'Sinovyal sıvı', 'Dren sıvısı',
    'Gaita', 'Rektal sürveyans', 'Burun (MRSA) tarama'
  ];
  const CULTURE_RESULT = ['Bekleniyor', 'Üreme yok', 'Üreme var', 'Kontaminasyon şüphesi'];
  const BOTTLES = ['1/2 şişe', '2/2 şişe', '1/4 şişe', '2/4 şişe', '3/4 şişe', '4/4 şişe'];
  const GRAM = ['Gram (+) kok, küme', 'Gram (+) kok, zincir', 'Gram (+) basil', 'Gram (−) basil', 'Gram (−) kok', 'Maya hücresi'];

  // g: '+' Gram pozitif, '-' Gram negatif, 'f' mantar, 'o' diğer
  const ORGANISMS = [
    { n: 'E. coli', g: '-' }, { n: 'K. pneumoniae', g: '-' }, { n: 'K. oxytoca', g: '-' },
    { n: 'P. aeruginosa', g: '-' }, { n: 'A. baumannii', g: '-' }, { n: 'Enterobacter spp.', g: '-' },
    { n: 'P. mirabilis', g: '-' }, { n: 'S. marcescens', g: '-' }, { n: 'Citrobacter spp.', g: '-' },
    { n: 'M. morganii', g: '-' }, { n: 'S. maltophilia', g: '-' }, { n: 'B. cepacia', g: '-' },
    { n: 'H. influenzae', g: '-' }, { n: 'Salmonella spp.', g: '-' }, { n: 'Brucella spp.', g: '-' },
    { n: 'S. aureus', g: '+' }, { n: 'KNS', g: '+' }, { n: 'E. faecalis', g: '+' }, { n: 'E. faecium', g: '+' },
    { n: 'S. pneumoniae', g: '+' }, { n: 'Viridans strep.', g: '+' }, { n: 'β-hemolitik strep.', g: '+' },
    { n: 'Corynebacterium spp.', g: '+' }, { n: 'L. monocytogenes', g: '+' }, { n: 'C. difficile', g: '+' },
    { n: 'Bacillus spp.', g: '+' },
    { n: 'C. albicans', g: 'f' }, { n: 'C. glabrata', g: 'f' }, { n: 'C. parapsilosis', g: 'f' },
    { n: 'C. tropicalis', g: 'f' }, { n: 'C. auris', g: 'f' }, { n: 'Candida spp.', g: 'f' },
    { n: 'Aspergillus spp.', g: 'f' }, { n: 'Mucorales', g: 'f' },
    { n: 'M. tuberculosis', g: 'o' }, { n: 'Anaerob', g: 'o' }
  ];

  const RESIST = ['ESBL', 'CRE', 'OXA-48', 'KPC', 'NDM', 'AmpC', 'MRSA', 'VRE', 'CRAB', 'CRPA', 'MDR', 'XDR', 'PDR', 'Kolistin R', 'İndüklenebilir klinda R', 'Flukonazol R'];

  const AST = {
    '-': ['Ampisilin', 'Amoks-klav', 'Pip-tazo', 'Sefuroksim', 'Seftriakson', 'Seftazidim', 'Sefepim', 'Seftaz-avibaktam', 'Seftolozan-tazo', 'Sefiderokol', 'Ertapenem', 'İmipenem', 'Meropenem', 'Amikasin', 'Gentamisin', 'Siprofloksasin', 'Levofloksasin', 'TMP-SMX', 'Kolistin', 'Tigesiklin', 'Fosfomisin', 'Nitrofurantoin'],
    '+': ['Penisilin', 'Ampisilin', 'Sefoksitin (MRSA)', 'Vankomisin', 'Teikoplanin', 'Linezolid', 'Daptomisin', 'Klindamisin', 'Eritromisin', 'TMP-SMX', 'Levofloksasin', 'Gentamisin (YD)', 'Rifampisin', 'Tigesiklin', 'Tetrasiklin'],
    'f': ['Flukonazol', 'Vorikonazol', 'Posakonazol', 'Kaspofungin', 'Mikafungin', 'Anidulafungin', 'Amfoterisin B'],
    'o': ['İzoniazid', 'Rifampisin', 'Etambutol', 'Pirazinamid', 'Metronidazol', 'Klindamisin']
  };

  const SERO = [
    'HBsAg', 'Anti-HBs', 'Anti-HBc IgG', 'HBeAg', 'HBV DNA', 'Anti-HCV', 'HCV RNA', 'Anti-HIV',
    'Brusella (RB/STA)', 'Galaktomannan', 'β-D-glukan', 'C. difficile toksin', 'Pnömokok idrar Ag',
    'Lejyonella idrar Ag', 'SARS-CoV-2 PCR', 'İnfluenza', 'Solunum paneli', 'Kriptokok Ag',
    'IGRA', 'ARB (EZN)', 'TB PCR', 'CMV DNA', 'VDRL / TPHA'
  ];

  const IMAGING = ['PA akciğer grafisi', 'Toraks BT', 'Batın USG', 'Batın BT', 'MR', 'EKO (TTE)', 'TEE', 'Doppler USG', 'Kraniyal BT / MR', 'Direkt grafi', 'Yumuşak doku USG', 'PET-BT'];
  const IMAGING_RESULT = ['Bekleniyor', 'Normal', 'Patolojik'];
  const IMAGING_FIND = ['Konsolidasyon', 'İnfiltrasyon', 'Buzlu cam', 'Plevral efüzyon', 'Kavite', 'Apse', 'Koleksiyon', 'Vejetasyon', 'Osteomiyelit bulgusu', 'Hidronefroz', 'Taş', 'Safra yolu dilatasyonu', 'Hepatosplenomegali', 'Yumuşak doku ödemi'];

  // Antibiyotikler: d = hızlı doz seçenekleri (normal böbrek fonksiyonunda erişkin; yalnızca giriş kısayolu)
  const ABX_GROUPS = [
    { t: 'Penisilin', items: [
      { n: 'Ampisilin', r: 'IV', d: ['2 g 6x1', '2 g 4x1'] },
      { n: 'Ampisilin-sulbaktam', r: 'IV', d: ['1,5 g 4x1', '3 g 4x1'] },
      { n: 'Amoksisilin-klavulanat', r: 'PO', d: ['1 g 2x1', '1,2 g 3x1 IV'] },
      { n: 'Piperasilin-tazobaktam', r: 'IV', d: ['4,5 g 4x1', '4,5 g 3x1'] },
      { n: 'Penisilin G (kristalize)', r: 'IV', d: ['4 MÜ 6x1', '3 MÜ 6x1'] }
    ] },
    { t: 'Sefalosporin', items: [
      { n: 'Sefazolin', r: 'IV', d: ['1 g 3x1', '2 g 3x1'] },
      { n: 'Sefuroksim', r: 'IV', d: ['750 mg 3x1', '1,5 g 3x1', '500 mg 2x1 PO'] },
      { n: 'Seftriakson', r: 'IV', d: ['1 g 1x1', '2 g 1x1', '2 g 2x1'] },
      { n: 'Sefotaksim', r: 'IV', d: ['2 g 3x1', '2 g 4x1'] },
      { n: 'Seftazidim', r: 'IV', d: ['2 g 3x1'] },
      { n: 'Sefepim', r: 'IV', d: ['2 g 2x1', '2 g 3x1'] },
      { n: 'Sefoperazon-sulbaktam', r: 'IV', d: ['2 g 2x1', '2 g 3x1'] },
      { n: 'Seftazidim-avibaktam', r: 'IV', d: ['2,5 g 3x1'] },
      { n: 'Seftolozan-tazobaktam', r: 'IV', d: ['1,5 g 3x1', '3 g 3x1'] },
      { n: 'Sefiderokol', r: 'IV', d: ['2 g 3x1'] }
    ] },
    { t: 'Karbapenem', items: [
      { n: 'Ertapenem', r: 'IV', d: ['1 g 1x1'] },
      { n: 'İmipenem', r: 'IV', d: ['500 mg 4x1', '1 g 3x1'] },
      { n: 'Meropenem', r: 'IV', d: ['1 g 3x1', '2 g 3x1'] }
    ] },
    { t: 'Gram pozitif', items: [
      { n: 'Vankomisin', r: 'IV', d: ['1 g 2x1', '15-20 mg/kg 2x1', '25 mg/kg yükleme'] },
      { n: 'Teikoplanin', r: 'IV', d: ['400 mg 1x1', '12 mg/kg 2x1 yükleme', '6 mg/kg 1x1'] },
      { n: 'Linezolid', r: 'IV', d: ['600 mg 2x1'] },
      { n: 'Daptomisin', r: 'IV', d: ['6 mg/kg 1x1', '8-10 mg/kg 1x1'] },
      { n: 'Tigesiklin', r: 'IV', d: ['100 mg yükleme, 50 mg 2x1', '200 mg yükleme, 100 mg 2x1'] },
      { n: 'Klindamisin', r: 'IV', d: ['600 mg 3x1', '900 mg 3x1', '300 mg 4x1 PO'] }
    ] },
    { t: 'Gram negatif / diğer', items: [
      { n: 'Kolistin', r: 'IV', d: ['9 MÜ yükleme', '4,5 MÜ 2x1'] },
      { n: 'Amikasin', r: 'IV', d: ['15 mg/kg 1x1', '1 g 1x1'] },
      { n: 'Gentamisin', r: 'IV', d: ['5 mg/kg 1x1', '3 mg/kg 1x1'] },
      { n: 'Siprofloksasin', r: 'IV', d: ['400 mg 2x1', '400 mg 3x1', '500 mg 2x1 PO', '750 mg 2x1 PO'] },
      { n: 'Levofloksasin', r: 'IV', d: ['750 mg 1x1', '500 mg 1x1'] },
      { n: 'Moksifloksasin', r: 'IV', d: ['400 mg 1x1'] },
      { n: 'Klaritromisin', r: 'IV', d: ['500 mg 2x1'] },
      { n: 'Azitromisin', r: 'IV', d: ['500 mg 1x1'] },
      { n: 'Metronidazol', r: 'IV', d: ['500 mg 3x1'] },
      { n: 'TMP-SMX', r: 'PO', d: ['800/160 mg 2x1', '15 mg/kg/gün (TMP) 3-4 doz'] },
      { n: 'Doksisiklin', r: 'PO', d: ['100 mg 2x1'] },
      { n: 'Fosfomisin', r: 'PO', d: ['3 g tek doz', '3 g 48 saatte 1', '4 g 3x1 IV'] },
      { n: 'Nitrofurantoin', r: 'PO', d: ['100 mg 2x1', '50 mg 4x1'] },
      { n: 'Rifampisin', r: 'PO', d: ['600 mg 1x1', '300 mg 2x1'] },
      { n: 'Streptomisin', r: 'IM', d: ['1 g 1x1'] },
      { n: 'Vankomisin PO', r: 'PO', d: ['125 mg 4x1', '500 mg 4x1'] },
      { n: 'Fidaksomisin', r: 'PO', d: ['200 mg 2x1'] },
      { n: 'Anti-TB (HRZE)', r: 'PO', d: ['Kiloya göre'] }
    ] },
    { t: 'Antifungal', items: [
      { n: 'Flukonazol', r: 'IV', d: ['800 mg yükleme, 400 mg 1x1', '400 mg 1x1', '200 mg 1x1'] },
      { n: 'Vorikonazol', r: 'IV', d: ['6 mg/kg 2x1 yükleme, 4 mg/kg 2x1', '200 mg 2x1 PO'] },
      { n: 'Posakonazol', r: 'PO', d: ['300 mg 2x1 yükleme, 300 mg 1x1'] },
      { n: 'İsavukonazol', r: 'IV', d: ['200 mg 3x1 (6 doz), 200 mg 1x1'] },
      { n: 'Kaspofungin', r: 'IV', d: ['70 mg yükleme, 50 mg 1x1'] },
      { n: 'Mikafungin', r: 'IV', d: ['100 mg 1x1'] },
      { n: 'Anidulafungin', r: 'IV', d: ['200 mg yükleme, 100 mg 1x1'] },
      { n: 'Lipozomal amfoterisin B', r: 'IV', d: ['3 mg/kg 1x1', '5 mg/kg 1x1'] }
    ] },
    { t: 'Antiviral', items: [
      { n: 'Asiklovir', r: 'IV', d: ['10 mg/kg 3x1', '800 mg 5x1 PO'] },
      { n: 'Valasiklovir', r: 'PO', d: ['1 g 3x1'] },
      { n: 'Gansiklovir', r: 'IV', d: ['5 mg/kg 2x1'] },
      { n: 'Valgansiklovir', r: 'PO', d: ['900 mg 2x1', '900 mg 1x1'] },
      { n: 'Oseltamivir', r: 'PO', d: ['75 mg 2x1'] },
      { n: 'Tenofovir disoproksil', r: 'PO', d: ['245 mg 1x1'] },
      { n: 'Tenofovir alafenamid', r: 'PO', d: ['25 mg 1x1'] },
      { n: 'Entekavir', r: 'PO', d: ['0,5 mg 1x1'] }
    ] }
  ];

  const ROUTES = ['IV', 'PO', 'IM', 'Nebül'];
  const ABX_STATUS = [
    { k: 'on', t: 'Kullanıyor' },
    { k: 'start', t: 'Başlansın' },
    { k: 'stop', t: 'Kesilsin' },
    { k: 'off', t: 'Kesilmiş' }
  ];
  const APPROVAL = ['Onaylandı', 'Onaylanmadı', 'Değiştirildi'];
  const APPROVAL_DAYS = [3, 5, 7, 10, 14, 21, 28];

  // Muayene: ex = diğer seçimlerle birlikte seçilemeyen "normal" seçenek
  const EXAM = [
    { k: 'gd', t: 'Genel durum', single: true, items: ['İyi', 'Orta', 'Kötü', 'Toksik görünüm'] },
    { k: 'bil', t: 'Bilinç', single: true, items: ['Açık, oryante', 'Konfüze', 'Letarjik', 'Stupor', 'Koma', 'Sedatize'] },
    { k: 'bb', t: 'Baş-boyun', ex: 'Doğal', items: ['Doğal', 'Ense sertliği', 'Kernig / Brudzinski (+)', 'Servikal LAP', 'Tonsiller eksüda', 'Oral kandidiyaz', 'Dental enfeksiyon', 'Konjonktival kanama'] },
    { k: 'sol', t: 'Solunum', ex: 'Doğal', items: ['Doğal', 'Raller (sağ)', 'Raller (sol)', 'Raller (bilateral)', 'Ronküs', 'Wheezing', 'Solunum sesi azalmış', 'Takipne', 'Pürülan sekresyon'] },
    { k: 'kvs', t: 'Kardiyovasküler', ex: 'Doğal', items: ['Doğal', 'Taşikardi', 'Aritmi', 'Yeni üfürüm', 'Bilinen üfürüm', 'Kapiller dolum uzamış', 'Endokardit stigmatası'] },
    { k: 'bat', t: 'Batın', ex: 'Doğal', items: ['Doğal', 'Hassasiyet', 'Defans', 'Rebound', 'Distansiyon', 'Asit', 'Hepatomegali', 'Splenomegali', 'Suprapubik hassasiyet', 'KVA hassasiyeti (sağ)', 'KVA hassasiyeti (sol)', 'Barsak sesleri azalmış'] },
    { k: 'deri', t: 'Deri / ekstremite', ex: 'Doğal', items: ['Doğal', 'Makülopapüler döküntü', 'Peteşi / purpura', 'Eritem', 'Selülit', 'Ödem', 'Bası yarası', 'Diyabetik ayak ülseri', 'Fluktuasyon', 'Krepitasyon', 'Nekroz / gangren', 'Eklemde şişlik-ısı', 'Flebit'] },
    { k: 'yara', t: 'Yara / insizyon', ex: 'Temiz, kuru', items: ['Temiz, kuru', 'Hiperemi', 'Seröz akıntı', 'Pürülan akıntı', 'Dehisens', 'Koleksiyon', 'Nekrotik doku', 'Kemiğe ulaşıyor'] },
    { k: 'kat', t: 'Kateter giriş yeri', ex: 'Temiz', items: ['Temiz', 'Hiperemi', 'Hassasiyet', 'Pürülan akıntı', 'Tünel enfeksiyonu'] },
    { k: 'nor', t: 'Nörolojik', ex: 'Doğal', items: ['Doğal', 'Lateralizan bulgu', 'Fokal defisit', 'Nöbet', 'Meningeal irritasyon'] }
  ];
  const WAGNER = ['0', '1', '2', '3', '4', '5'];
  const PU_STAGE = ['1', '2', '3', '4', 'Evrelendirilemeyen'];

  const DX = [
    'Toplum kökenli pnömoni', 'Hastane kökenli pnömoni', 'VİP', 'Aspirasyon pnömonisi',
    'Komplike İYE / piyelonefrit', 'Sistit', 'Asemptomatik bakteriüri', 'KİKDE', 'Primer bakteriyemi',
    'Sepsis', 'Septik şok', 'Cerrahi alan enfeksiyonu', 'Diyabetik ayak enfeksiyonu', 'Selülit',
    'Osteomiyelit', 'Protez eklem enfeksiyonu', 'İntraabdominal enfeksiyon', 'Kolanjit', 'Menenjit',
    'Endokardit', 'Febril nötropeni', 'C. difficile enfeksiyonu', 'Kandidemi', 'İnvaziv aspergilloz',
    'Kolonizasyon', 'Kontaminasyon', 'Enfeksiyon dışı ateş', 'İlaç ateşi', 'Kronik HBV enfeksiyonu',
    'İnaktif HBsAg taşıyıcılığı', 'Kronik HCV enfeksiyonu', 'Bruselloz', 'Tüberküloz'
  ];

  const REC_GROUPS = [
    { t: 'Tanısal', items: [
      '2 set kan kültürü alınması (periferik + kateter)', 'İdrar tetkiki ve idrar kültürü',
      'Balgam / trakeal aspirat kültürü', 'Derin doku kültürü', 'Kateter ucu kültürü',
      'Hemogram, CRP, biyokimya takibi', 'Prokalsitonin', 'Kontrol kan kültürü (48-72 saat sonra)',
      'PA akciğer grafisi', 'Toraks BT', 'Batın USG', 'Batın BT', 'EKO (TTE)', 'TEE',
      'Göz dibi muayenesi', 'Galaktomannan', 'Vankomisin vadi düzeyi (4. doz öncesi)',
      'HBV DNA, HBeAg, Anti-HBe', 'Anti-HIV', 'LP ve BOS incelemesi'
    ] },
    { t: 'Tedavi', items: [
      'Mevcut antibiyotik tedavisine devam edilmesi', 'Antibiyotik tedavisinin kesilmesi',
      'Kültür sonucuna göre de-eskalasyon', 'Oral tedaviye geçilmesi',
      'Dozların kreatinin klirensine göre ayarlanması', 'Beta-laktamın uzatılmış infüzyonla verilmesi',
      'Kaynak kontrolü için cerrahi değerlendirme', 'Kateterin çıkarılması',
      'Üriner kateterin değiştirilmesi / çıkarılması', 'Yara bakımı ve debridman',
      'HBV reaktivasyon profilaksisi başlanması', 'Antibiyotik başlanmasına gerek yok'
    ] },
    { t: 'Enfeksiyon kontrol', items: [
      'Temas izolasyonu', 'Damlacık izolasyonu', 'Solunum (hava yolu) izolasyonu',
      'Enfeksiyon kontrol komitesine bildirim', 'Bildirimi zorunlu hastalık bildirimi'
    ] },
    { t: 'Takip', items: [
      'Ateş takibi', 'Kültür sonuçları ile tekrar değerlendirilecektir',
      'Tarafımızca takip edilecektir', 'Gerektiğinde tekrar konsülte edilmesi',
      'Taburculuk sonrası poliklinik kontrolü'
    ] }
  ];

  const NEXT = [
    { t: 'Yarın', d: 1 }, { t: '48 saat', d: 2 }, { t: '72 saat', d: 3 }, { t: '1 hafta', d: 7 }
  ];

  const CLOSE_REASONS = ['Taburcu', 'Tedavi tamamlandı', 'Konsültasyon kapandı', 'Sevk', 'Ex'];

  window.KONSULT_CATALOG = {
    WARDS, BEDS, REASON_GROUPS, COMORB, RISKS, ALLERGY, DEVICES, DEMO, VITALS, O2, PRESSORS, URINE,
    LAB_GROUPS, URINALYSIS, SAMPLES, CULTURE_RESULT, BOTTLES, GRAM, ORGANISMS, RESIST, AST, SERO,
    IMAGING, IMAGING_RESULT, IMAGING_FIND, ABX_GROUPS, ROUTES, ABX_STATUS, APPROVAL, APPROVAL_DAYS,
    EXAM, WAGNER, PU_STAGE, DX, REC_GROUPS, NEXT, CLOSE_REASONS
  };
})();
