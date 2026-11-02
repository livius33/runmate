// German copy of the marketing pages (Phase 6). The English dictionary (en.ts) must have exactly the same keys
// (`Dict` makes tsc check the shape; tests/marketing/i18n.test.ts checks arrays and keys at every depth).
// Honesty rules: no invented users, ratings or testimonials; Garmin access is the unofficial login (experimental).
export const de = {
  locale: 'de',
  meta: {
    title: 'Runmate – Marathonplan nach echten Methoden, der sich an deine Läufe anpasst',
    description:
      'Trainingspläne nach Daniels, Pfitzinger, Hansons, Lydiard, 80/20 oder dem norwegischen Modell. Runmate gleicht jeden Tag Plan und Lauf ab und passt nach festen, lesbaren Regeln an. Open Source, selbst hostbar, Daten in der EU.',
    pricingTitle: 'Preise – Runmate',
    pricingDescription: 'Selbst hosten für 0 € oder gehostet ab 6 € im Monat. 30 Tage testen, ohne Karte.',
    methodsTitle: 'Trainingsmethoden – Runmate',
    methodsDescription: 'Alle Vorlagen, aus denen Runmate Pläne baut: Phasen, Umfang, Intensität, Anpassungsregeln und Quellen.',
    ogAlt: 'Runmate: Lauf nach Plan. Der Plan läuft mit.',
  },
  nav: {
    methods: 'Methoden',
    engine: 'Anpassung',
    pricing: 'Preise',
    faq: 'FAQ',
    github: 'GitHub',
    signIn: 'Anmelden',
    language: 'English',
    languageHref: '/en',
    home: 'Startseite',
  },
  cta: {
    trial: '30 Tage testen',
    trialNote: 'Ohne Karte. Danach ab 6 € im Monat – oder kostenlos selbst hosten.',
    waitlist: 'Auf die Warteliste',
    waitlistNote: 'Die gehostete Version startet bald. Wir schreiben dir einmal, wenn es losgeht.',
    github: 'Code auf GitHub',
    methods: 'Methoden ansehen',
  },
  hero: {
    line1: 'Lauf nach Plan.',
    line2: 'Der Plan läuft mit.',
    sub: 'Trainingspläne nach Daniels, Pfitzinger & Co., die sich an deine echten Läufe anpassen – mit Regeln, die du nachlesen kannst.',
    sample: 'Beispieldaten, echte Oberfläche',
    appLanguage: '',
  },
  open: {
    title: 'Gebaut im Training für den Porto-Marathon 2026.',
    body: 'Runmate ist im eigenen Marathonblock entstanden: jeden Morgen der Plan, jeden Abend der Abgleich. Was nicht geholfen hat, flog raus. Was blieb, ist offen – Code, Vorlagen und die Forschungsnotizen hinter jeder Regel.',
    templates: 'Methoden-Vorlagen',
    research: 'Forschungsnotizen zu den Regeln',
    hrModel: 'Pulsmodell für alle Zonen',
    licence: 'Lizenz',
    race: 'Rennen in Porto am 8. November 2026',
  },
  how: {
    title: 'In drei Schritten zum Plan',
    steps: [
      { title: 'Daten verbinden', text: 'Garmin-Login (experimentell), Apple Health per Kurzbefehl oder Dateien importieren: FIT, GPX, TCX oder der Garmin-Export als ZIP.' },
      { title: 'Methode und Ziel wählen', text: 'Rennen, Zielzeit, Trainingstage. Runmate misst deinen aktuellen Umfang und baut daraus Woche für Woche den Block.' },
      { title: 'Jeden Tag wissen, was ansteht', text: 'Heute: Einheit, Tempo, Puls und warum. Nach dem Lauf: Abgleich mit dem Plan, und der Rest der Woche passt sich an.' },
    ],
  },
  methods: {
    title: 'Sieben Methoden. Keine Blackbox.',
    sub: 'Jede Methode ist eine lesbare Vorlage: Phasen, Umfang, Intensität, Anpassungsregeln und Quellen. Die Woche daneben erzeugt der echte Generator aus genau dieser Vorlage.',
    pick: 'Methode wählen',
    read: 'Vorlage lesen',
    week: 'Eine Aufbauwoche',
    weekFor: 'Beispielprofil, Ziel',
    total: 'km in der Woche',
    sources: 'Quellen',
    own: 'Eigene Methode',
    ownText: 'Oder du baust deine eigene: Jeder Wert einer Vorlage lässt sich ändern, die Sicherheitsgrenzen bleiben.',
    distances: { marathon: 'Marathon', half: 'Halbmarathon', '10k': '10 km' },
    allTitle: 'Alle Methoden',
    allSub: 'Aus diesen Vorlagen baut Runmate Pläne. Jede nennt ihre Quellen und sagt, wo sie vereinfacht.',
    back: 'Alle Methoden',
    params: 'Die Werte der Vorlage',
    paramWeeks: 'Taper',
    paramRuns: 'Läufe pro Woche',
    paramLong: 'Langer Lauf höchstens',
    paramRamp: 'Steigerung pro Woche höchstens',
    paramEasy: 'Locker im Aufbau',
    fileNote: 'Die Vorlage ist eine Markdown-Datei im Repository. Der Text unten ist ihr Inhalt.',
  },
  engine: {
    title: 'Verpasst? Krank? Müde?',
    title2: 'Der Plan reagiert – und sagt dir warum.',
    sub: 'Die Anpassung läuft nach festen Regeln aus der Vorlage, nicht nach Gefühl. Jede Änderung steht im Protokoll: vorher, nachher, welche Regel – und lässt sich zurücknehmen.',
    items: [
      { title: 'Schlüsseleinheit verpasst', text: 'Sie rückt auf den nächsten passenden Tag, höchstens so weit, wie die Methode erlaubt. Sonst entfällt sie.' },
      { title: 'Kilometer offen', text: 'Verteilt auf lockere Tage, mit Obergrenze pro Tag – oder sie verfallen, wenn die Methode das so will.' },
      { title: 'Müde', text: 'Fällt die Form (TSB) zu tief oder steigt die Belastung (ACWR) zu schnell, wird die nächste harte Einheit locker.' },
      { title: 'Krank oder Pause', text: 'Du trägst den Zeitraum ein, danach kommst du gestuft zurück: erst weniger Umfang, dann wieder Qualität.' },
    ],
  },
  insights: {
    title: 'Sieh, ob dein Block wirkt.',
    sub: 'Nicht nur Kurven: Runmate fasst zusammen, was sich bewegt – Umfang gegen Plan, längster Lauf, Tempo bei gleichem Puls.',
  },
  race: {
    title: 'Bis zur Startlinie geplant.',
    sub: 'Die Rennwoche mit Kohlenhydraten in Gramm, ein Split-Plan aus deinem Zieltempo und ein Plan B, falls der Tag nicht deiner ist.',
  },
  pricing: {
    title: 'Selbst hosten oder loslegen.',
    sub: 'Derselbe Code. Gehostet kümmern wir uns um Server, Sync und Updates.',
    month: 'Monatlich',
    year: 'Jährlich',
    perMonth: '/ Monat',
    perYear: '/ Jahr',
    trial: '30 Tage alle Funktionen, ohne Karte. Abrechnung über Paddle. Monatlich kündbar.',
    selfHost: {
      name: 'Selbst hosten',
      price: '0 €',
      note: 'AGPL-3.0, für immer',
      points: ['Alle Funktionen', 'Eigene Datenbank (Postgres/Neon)', 'Docker oder Vercel', 'Garmin-Login, Apple Health, Datei-Import'],
      cta: 'Anleitung lesen',
    },
    basic: {
      name: 'Basic',
      month: '6 €',
      year: '59 €',
      points: ['Täglicher Sync', 'Plan nach einer Methode', 'Analyse und Wochenrückblick', 'Anpassungen als Vorschlag zum Übernehmen'],
    },
    plus: {
      name: 'Plus',
      month: '10 €',
      year: '99 €',
      points: ['Alles aus Basic', 'Anpassung automatisch', 'Mehrere Pläne und Rennen', 'Eigene Methode', 'Renntag: Splits, Plan A/B, Checkliste'],
    },
    always: 'Immer dabei: Export als ZIP, Löschen mit einem Klick, Daten in der EU.',
  },
  faq: {
    title: 'Fragen',
    items: [
      {
        q: 'Wie kommen meine Laufdaten rein?',
        a: 'Drei Wege: der Garmin-Login mit deinen eigenen Zugangsdaten (experimentell), Apple Health über einen iOS-Kurzbefehl, der deine Workouts an einen geheimen Link schickt, oder der Import von FIT-, GPX- und TCX-Dateien bzw. dem Garmin-Datenexport als ZIP. Strava kommt später.',
      },
      {
        q: 'Ist der Garmin-Zugang offiziell?',
        a: 'Nein. Runmate meldet sich mit deinen Zugangsdaten bei Garmin Connect an, so wie es die Garmin-App tut. Das ist kein offizieller Zugang: Er kann jederzeit brechen und verstößt möglicherweise gegen Garmins Nutzungsbedingungen. Deine Zugangsdaten werden verschlüsselt gespeichert und nie angezeigt. Der Wechsel auf die offizielle Garmin-Schnittstelle ist geplant; bis dahin funktioniert der Datei-Import immer.',
      },
      {
        q: 'Wo liegen meine Daten?',
        a: 'In der gehosteten Version in der EU (Datenbank in Frankfurt). Gesundheitsdaten wie Puls verarbeiten wir nur mit deiner ausdrücklichen Einwilligung, die du jederzeit widerrufen kannst. Du kannst alles als ZIP exportieren und dein Konto mit allen Daten löschen. Keine Werbe- oder Tracking-Cookies.',
      },
      {
        q: 'Ersetzt Runmate einen Coach oder Arzt?',
        a: 'Nein. Runmate ist ein Trainingswerkzeug und kein Medizinprodukt. Die Pläne folgen veröffentlichten Methoden und deinen Daten; sie stellen keine Diagnose und versprechen kein Ergebnis. Bei Schmerzen oder Beschwerden: Training unterbrechen und ärztlichen Rat einholen.',
      },
      {
        q: 'Nur Marathon?',
        a: 'Marathon und Halbmarathon haben fertige Vorlagen, 10 km geht mit der eigenen Methode. Zwischen zwei Zielen hält ein Grundlagenblock die Form.',
      },
      {
        q: 'Wie kündige ich?',
        a: 'Jederzeit zum Ende des bezahlten Zeitraums, über den Button „Verträge hier kündigen“ – auch ohne Anmeldung. Die Testphase endet von selbst; ohne Karte wird nichts abgebucht.',
      },
      {
        q: 'Was heißt Open Source hier?',
        a: 'Der Code steht unter der AGPL-3.0. Du kannst Runmate kostenlos selbst betreiben und verändern. Wer eine veränderte Version öffentlich anbietet, muss den Code ebenfalls veröffentlichen.',
      },
    ],
  },
  final: {
    title: 'Dein nächster Block beginnt Montag.',
    sub: 'Wähl eine Methode, trag dein Rennen ein, und Runmate rechnet dir die Wochen bis zur Startlinie.',
  },
  waitlist: {
    label: 'E-Mail-Adresse',
    placeholder: 'du@beispiel.de',
    submit: 'Auf die Warteliste',
    privacy: 'Du bekommst eine Mail mit einem Bestätigungslink (Double-Opt-in). Ohne Bestätigung löschen wir die Adresse nach 7 Tagen. Mehr in der Datenschutzerklärung.',
    status: {
      sent: { title: 'Fast geschafft.', text: 'Wir haben dir einen Bestätigungslink geschickt. Erst wenn du ihn öffnest, stehst du auf der Liste.' },
      confirmed: { title: 'Du stehst auf der Liste.', text: 'Wir schreiben dir, sobald die gehostete Version startet. Abmelden geht über den Link in jeder Mail.' },
      removed: { title: 'Ausgetragen.', text: 'Deine Adresse ist gelöscht.' },
      invalid: { title: 'Das hat nicht geklappt.', text: 'Bitte prüf die E-Mail-Adresse und versuch es noch einmal.' },
      expired: { title: 'Der Link ist abgelaufen.', text: 'Bestätigungslinks gelten 7 Tage. Trag dich einfach noch einmal ein.' },
      error: { title: 'Gerade nicht erreichbar.', text: 'Die Warteliste ist im Moment nicht verfügbar. Bitte versuch es später noch einmal.' },
    },
    back: 'Zur Startseite',
  },
  footer: {
    tagline: 'Adaptive Laufpläne nach echten Methoden. Open Source unter AGPL-3.0.',
    product: 'Produkt',
    legal: 'Rechtliches',
    impressum: 'Impressum',
    privacy: 'Datenschutz',
    terms: 'AGB',
    cancel: 'Verträge hier kündigen',
  },
}

type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> }
export type Dict = Widen<typeof de>
