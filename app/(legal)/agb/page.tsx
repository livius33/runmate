import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Ph } from '@/components/legal/Template'
import { DISCLAIMER_TEXT } from '@/components/legal/Disclaimer'
import { TRIAL_DAYS } from '@/lib/billing/entitlements'

export const metadata: Metadata = { title: 'AGB – Runmate' }

// Template (Phase 4): terms of use for the hosted subscription, trial, withdrawal right (model text of Anlage 1 zu
// Art. 246a § 1 EGBGB, adapted for a service) with the model withdrawal form (Anlage 2), cancellation. Paddle is the
// merchant of record, so the purchase itself also follows Paddle's buyer terms.
export default function AgbPage() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen" updated="02.11.2026">
      <h2>§ 1 Geltungsbereich und Anbieter</h2>
      <p>
        Diese Bedingungen gelten für die Nutzung der gehosteten Version von Runmate (<Ph>Domain</Ph>), angeboten von{' '}
        <Ph>Name bzw. Firma, Anschrift</Ph> („wir“). Der Kauf eines Abos erfolgt über Paddle.com Market Limited als Händler
        (Merchant of Record); für Bezahlung, Rechnung und Erstattung gelten ergänzend die Käuferbedingungen von Paddle
        (paddle.com/legal/checkout-buyer-terms). Abweichende Bedingungen der Nutzer gelten nicht.
      </p>

      <h2>§ 2 Leistungen</h2>
      <p>Runmate wertet Lauftraining aus und erstellt und pflegt einen Trainingsplan. Es gibt zwei Tarife:</p>
      <ul>
        <li><b>Basic:</b> Synchronisierung und Import von Aktivitäten, Analyse, Hinweise und ein erstellter Trainingsplan; Planänderungen der Regel-Engine als Vorschläge.</li>
        <li><b>Plus:</b> alles aus Basic, dazu automatische Planänderungen (Verschieben, Ermüdungsschutz, Ausgleich), mehrere Pläne und Rennen gleichzeitig, eine eigene Methode und Renntag-Werkzeuge.</li>
      </ul>
      <p>
        Datenquellen Dritter (z. B. Garmin Connect über die Anmeldung mit deinen Zugangsdaten) sind keine offiziellen
        Schnittstellen; ihr Funktionieren hängt von diesen Anbietern ab und ist nicht geschuldet. Wir bemühen uns um eine
        hohe Verfügbarkeit, schulden aber keine ununterbrochene Erreichbarkeit; Wartungen kündigen wir nach Möglichkeit an.
      </p>

      <h2>§ 3 Kein Medizinprodukt</h2>
      <p>{DISCLAIMER_TEXT}</p>

      <h2>§ 4 Konto und Testphase</h2>
      <p>
        Für die Nutzung ist ein Konto nötig. Mit der ersten Anmeldung beginnt eine kostenlose Testphase von {TRIAL_DAYS} Tagen
        mit allen Funktionen. Sie braucht keine Zahlungsdaten und endet automatisch; es entsteht kein Abo und keine
        Zahlungspflicht. Danach bleiben deine Daten lesbar, exportierbar und löschbar; neue Daten und Pläne gibt es mit einem
        Abo.
      </p>

      <h2>§ 5 Vertragsschluss, Preise, Zahlung</h2>
      <p>
        Das Abo kommt zustande, wenn du im Bezahlfenster von Paddle die Bestellung mit „zahlungspflichtig bestellen“ (oder
        gleichwertig) abschließt. Es gelten die dort angezeigten Preise einschließlich Umsatzsteuer: Basic{' '}
        <Ph>Preis</Ph> pro Monat oder <Ph>Preis</Ph> pro Jahr, Plus <Ph>Preis</Ph> pro Monat oder <Ph>Preis</Ph> pro Jahr.
        Die Zahlung erfolgt im Voraus für den jeweiligen Abrechnungszeitraum über Paddle.
      </p>

      <h2>§ 6 Laufzeit und Kündigung</h2>
      <ul>
        <li>Monatsabo: Laufzeit ein Monat; es verlängert sich jeweils um einen Monat, wenn es nicht vor Ablauf gekündigt wird.</li>
        <li>
          Jahresabo: erste Laufzeit zwölf Monate. <Ph>Verlängerung juristisch festlegen – gegenüber Verbrauchern ist nach
            § 309 Nr. 9 BGB nach der ersten Laufzeit nur eine Verlängerung auf unbestimmte Zeit mit Kündigungsfrist von höchstens
            einem Monat zulässig; anteilige Erstattung bei Kündigung danach regeln</Ph>
        </li>
        <li>
          Du kannst jederzeit zum Ende des laufenden Abrechnungszeitraums kündigen, ohne Angabe von Gründen: über die
          Schaltfläche <Link href="/kuendigen" className="underline">„Verträge hier kündigen“</Link> (auch ohne Anmeldung
          erreichbar), in den Einstellungen unter „Abo“ oder per E-Mail an <Ph>E-Mail-Adresse</Ph>. Bis zum Ende des bezahlten
          Zeitraums bleibt alles nutzbar. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.
        </li>
        <li>Löschst du dein Konto, kündigen wir ein laufendes Abo sofort mit.</li>
      </ul>

      <h2>§ 7 Deine Daten</h2>
      <p>
        Deine Daten gehören dir. Du kannst sie jederzeit vollständig exportieren und dein Konto löschen (Einstellungen → Meine
        Daten). Einzelheiten in der <Link href="/datenschutz" className="underline">Datenschutzerklärung</Link>.
      </p>

      <h2>§ 8 Haftung</h2>
      <p>
        Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und
        nach dem Produkthaftungsgesetz. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht ist die Haftung
        auf den vertragstypischen, vorhersehbaren Schaden begrenzt; im Übrigen ist die Haftung für leichte Fahrlässigkeit
        ausgeschlossen. <Ph>Haftungsklausel juristisch prüfen</Ph>
      </p>

      <h2>§ 9 Änderungen</h2>
      <p>
        Änderungen dieser Bedingungen oder der Preise teilen wir mindestens sechs Wochen vorher per E-Mail mit. Sie gelten
        nur, wenn du zustimmst; ohne Zustimmung läuft dein Abo zu den bisherigen Bedingungen bis zum Ende der Laufzeit weiter.
      </p>

      <h2>§ 10 Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; zwingende Verbraucherschutzvorschriften deines
        Wohnsitzstaats bleiben unberührt. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.
      </p>

      <h2 id="widerruf">Widerrufsbelehrung</h2>
      <h3>Widerrufsrecht</h3>
      <p>
        Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist
        beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
      </p>
      <p>
        Um dein Widerrufsrecht auszuüben, musst du uns (<Ph>Name bzw. Firma</Ph>, <Ph>Anschrift</Ph>, E-Mail:{' '}
        <Ph>E-Mail-Adresse</Ph>) mittels einer eindeutigen Erklärung (z. B. eine E-Mail oder ein mit der Post versandter
        Brief) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst dafür das unten stehende
        Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es
        aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.
      </p>
      <p><Ph>Mit Paddle abstimmen: Widerruf und Erstattung über Paddle als Händler; Empfänger und Ablauf hier benennen</Ph></p>
      <h3>Folgen des Widerrufs</h3>
      <p>
        Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und
        spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses
        Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der
        ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes vereinbart; in
        keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet. Hast du verlangt, dass die Dienstleistungen
        während der Widerrufsfrist beginnen sollen, so hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der
        bis zu dem Zeitpunkt, zu dem du uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichtest,
        bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen
        entspricht.
      </p>

      <h3>Muster-Widerrufsformular</h3>
      <div className="rounded-xl border border-border p-4">
        <p>(Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück.)</p>
        <p className="mt-2">– An <Ph>Name bzw. Firma, Anschrift, E-Mail-Adresse</Ph>:</p>
        <p>– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden
          Waren (*)/die Erbringung der folgenden Dienstleistung (*)</p>
        <p>– Bestellt am (*)/erhalten am (*)</p>
        <p>– Name des/der Verbraucher(s)</p>
        <p>– Anschrift des/der Verbraucher(s)</p>
        <p>– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</p>
        <p>– Datum</p>
        <p className="mt-2 text-xs text-muted-foreground">(*) Unzutreffendes streichen.</p>
      </div>
    </LegalPage>
  )
}
