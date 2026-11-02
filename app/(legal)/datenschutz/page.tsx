import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Ph } from '@/components/legal/Template'
import { HEALTH_CONSENT_VERSION } from '@/lib/legal/consent-text'

export const metadata: Metadata = { title: 'Datenschutzerklärung – Runmate' }

// Template (Phase 4): information under Art. 13 GDPR for the hosted Runmate. Processors and regions as planned in
// docs/LAUNCH-PLAN.md (Vercel fra1, Neon aws-eu-central-1, Clerk auth only, Paddle merchant of record). Transfer bases
// and retention periods are placeholders until the DPAs are signed.
export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung" updated="02.11.2026">
      <p>
        Diese Erklärung beschreibt, welche personenbezogenen Daten Runmate verarbeitet, wofür, auf welcher Rechtsgrundlage und
        welche Rechte du hast. Sie gilt für die gehostete Version von Runmate. Wer Runmate selbst betreibt, ist für die
        eigene Installation selbst verantwortlich.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        <Ph>Name bzw. Firma</Ph>, <Ph>Anschrift</Ph>, E-Mail: <Ph>Datenschutz-Kontaktadresse</Ph>.<br />
        <Ph>Datenschutzbeauftragter, falls benannt – sonst Satz entfernen</Ph>
      </p>

      <h2>2. Was wir verarbeiten und warum</h2>

      <h3>2.1 Aufruf der Website</h3>
      <p>
        Beim Aufruf verarbeitet unser Hoster technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Adresse,
        Browserkennung) in Server-Protokollen, um die Seite auszuliefern und Angriffe abzuwehren. Rechtsgrundlage: Art. 6
        Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Betrieb). Speicherdauer: <Ph>Aufbewahrung der
          Vercel-Protokolle laut Vertrag/Einstellung</Ph>.
      </p>

      <h3>2.2 Konto und Anmeldung</h3>
      <p>
        Für ein Konto verarbeiten wir E-Mail-Adresse, Anmeldedaten und Sitzungsinformationen. Die Anmeldung läuft über
        Clerk; Clerk erhält nur diese Konto- und Anmeldedaten, keine Trainings- oder Gesundheitsdaten. Rechtsgrundlage:
        Art. 6 Abs. 1 lit. b DSGVO (Vertrag). Das Anmelde-Cookie ist technisch notwendig (§ 25 Abs. 2 Nr. 2 TDDDG); andere
        Cookies, Tracking oder Werbung gibt es nicht.
      </p>

      <h3>2.3 Trainingsdaten</h3>
      <p>
        Aktivitäten (Datum, Distanz, Dauer, Tempo, Höhenmeter, Strecke als GPS-Daten), dein Trainingsplan, deine Eingaben
        (Profil, Rennen, Pausen, Rückmeldungen) und die daraus berechneten Werte. Zweck: Auswertung deines Trainings und
        ein darauf abgestimmter Plan. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h3>2.4 Gesundheitsdaten (besondere Kategorie, Art. 9 DSGVO)</h3>
      <p>
        Herzfrequenz (auch in Läufen), Herzfrequenzvariabilität, Ruhepuls, Schlaf und Körpergewicht sind Gesundheitsdaten.
        Wir verarbeiten sie nur mit deiner ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a, Art. 6 Abs. 1 lit. a DSGVO),
        die du vor dem Verbinden der ersten Datenquelle oder dem ersten Import separat erteilst (Textversion{' '}
        {HEALTH_CONSENT_VERSION}). Wir speichern Zeitpunkt und Textversion deiner Einwilligung. Du kannst sie jederzeit in
        den Einstellungen widerrufen; danach kommen keine neuen Daten mehr an, und du kannst die gespeicherten Gesundheits-
        und Aktivitätsdaten löschen. Der Widerruf berührt nicht die Rechtmäßigkeit der Verarbeitung bis dahin.
      </p>
      <p>
        Runmate ist kein Medizinprodukt: Die Auswertung dient der Trainingssteuerung, nicht der Diagnose.
      </p>

      <h3>2.5 Datenquellen, die du selbst verbindest</h3>
      <ul>
        <li>
          <b>Garmin Connect (Anmeldung):</b> Auf deinen Wunsch speichern wir deine Garmin-Zugangsdaten verschlüsselt
          (AES-256-GCM) und rufen damit deine eigenen Aktivitäten bei Garmin ab. Dabei werden die Zugangsdaten an Garmin
          übermittelt. Garmin ist nicht unser Auftragsverarbeiter; für die Daten bei Garmin gilt Garmins
          Datenschutzerklärung. Es handelt sich nicht um eine offizielle Garmin-Schnittstelle.
        </li>
        <li>
          <b>Apple Health:</b> Ein iOS-Kurzbefehl auf deinem Gerät sendet Tageswerte und Trainings an deinen privaten Link.
          Apple erhält dabei nichts von uns.
        </li>
        <li>
          <b>Datei-Import (FIT, GPX, TCX, ZIP):</b> Dateien werden gelesen, die Aktivitäten gespeichert; die Originaldateien
          speichern wir nicht.
        </li>
      </ul>
      <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, für Gesundheitswerte zusätzlich deine Einwilligung (2.4).</p>

      <h3>2.6 Abo und Zahlung</h3>
      <p>
        Abos verkauft Paddle.com Market Limited (Judd House, 18–29 Mora Street, London EC1V 8BT, Vereinigtes Königreich) als
        Händler (Merchant of Record). Paddle verarbeitet Zahlungs- und Rechnungsdaten in eigener Verantwortung (Datenschutz
        bei Paddle: paddle.com/legal/privacy). Wir erhalten von Paddle Abo-Status, Tarif, Laufzeit sowie Kunden- und
        Abo-Kennung, keine Zahlungsdaten. Das Bezahlfenster (Paddle.js) wird erst geladen, wenn du auf einen Kaufknopf
        tippst. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Die 30-tägige Testphase braucht keine Zahlungsdaten.
      </p>

      <h2>3. Empfänger und Auftragsverarbeiter</h2>
      <ul>
        <li><b>Vercel Inc.</b> (USA) – Hosting, Rechenzentrum Frankfurt (fra1). <Ph>AVV abgeschlossen am …; Grundlage der Übermittlung in die USA (EU-US Data Privacy Framework oder Standardvertragsklauseln)</Ph></li>
        <li><b>Neon Inc.</b> (USA) – Datenbank, Speicherort Frankfurt (AWS eu-central-1). <Ph>AVV; Übermittlungsgrundlage</Ph></li>
        <li><b>Clerk Inc.</b> (USA) – Anmeldung, nur Konto- und Anmeldedaten. <Ph>AVV; Übermittlungsgrundlage</Ph></li>
        <li><b>Paddle.com Market Limited</b> (Vereinigtes Königreich) – Verkauf und Zahlung, eigene Verantwortung (2.6); für das Vereinigte Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission.</li>
      </ul>
      <p>Wir verkaufen keine Daten und geben sie nicht für Werbung weiter.</p>

      <h2>4. Speicherdauer</h2>
      <p>
        Deine Daten bleiben gespeichert, solange dein Konto besteht. Löschst du dein Konto (Einstellungen → Meine Daten),
        löschen wir alle deine Daten sofort und kündigen ein laufendes Abo. Rechnungsdaten bewahrt Paddle nach den
        gesetzlichen Fristen auf. <Ph>Löschfristen von Backups bei Neon (Point-in-Time-Recovery-Zeitraum)</Ph>
      </p>

      <h2>5. Automatisierte Entscheidungen</h2>
      <p>
        Der Trainingsplan wird nach festen, offengelegten Regeln automatisch angepasst. Das ist keine automatisierte
        Entscheidung mit rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22 DSGVO; jede Anpassung lässt sich
        zurücknehmen.
      </p>

      <h2>6. Deine Rechte</h2>
      <ul>
        <li>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18)</li>
        <li>Datenübertragbarkeit (Art. 20): Einstellungen → Meine Daten → „Alle Daten exportieren“ (ZIP mit JSON-Dateien)</li>
        <li>Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21)</li>
        <li>Widerruf einer Einwilligung jederzeit mit Wirkung für die Zukunft (Art. 7 Abs. 3): Einstellungen → Gesundheitsdaten</li>
        <li>Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77), z. B. <Ph>zuständige Aufsichtsbehörde am Sitz des Verantwortlichen mit Anschrift</Ph></li>
      </ul>

      <h2>7. Pflicht zur Bereitstellung</h2>
      <p>
        Für ein Konto ist eine E-Mail-Adresse nötig. Gesundheitsdaten und Datenquellen sind freiwillig; ohne sie bleibt
        nur die Planung ohne Auswertung deiner Läufe.
      </p>

      <p className="text-xs text-muted-foreground">Siehe auch: <Link href="/impressum" className="underline">Impressum</Link> · <Link href="/agb" className="underline">AGB</Link></p>
    </LegalPage>
  )
}
