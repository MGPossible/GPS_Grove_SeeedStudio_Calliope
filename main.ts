// main.ts

/**
 * Air530 GNSS / GPS Erweiterung
 */

//% color=#8f3fd1 icon="\uf20e" block="GPS Air530 by MG"
//% groups=['Grundfunktionen', 'Erweiterungen']
namespace air530 {

    // =========================================================
    // ENUMS
    // =========================================================

    export enum DatumZeitTyp {
        //% block="Datum"
        Datum,
        //% block="Uhrzeit"
        Uhrzeit,
        //% block="Datum und Uhrzeit"
        DatumUndZeit
    }

    export enum PositionsTyp {
        //% block="Breitengrad"
        Breitengrad,
        //% block="Längengrad"
        Laengengrad,
        //% block="Koordinaten"
        Koordinaten,
        //% block="Höhe"
        Hoehe,
        //% block="Alle Positionsdaten"
        Alle
    }

    export enum BewegungsTyp {
        //% block="Geschwindigkeit km/h"
        GeschwindigkeitKMH,
        //% block="Geschwindigkeit m/s"
        GeschwindigkeitMS,
        //% block="Kurs"
        Kurs,
        //% block="Alle Bewegungsdaten"
        Alle
    }

    export enum KoordinatenFormat {
        //% block="Grad Minuten Sekunden"
        GMS,

        //% block="Grad Dezimalminuten"
        GDM,

        //% block="Dezimalgrad"
        DG
    }

    export enum InfoTyp {
        //% block="Verwendete Satelliten (Anzahl)"
        Satelliten,

        //% block="Signalqualität"
        Qualitaet,

        //% block="HDOP"
        HDOP,

        //% block="Status"
        Status
    }

    // =========================================================
    // VARIABLEN
    // =========================================================

    let rxPin = SerialPin.C16
    let txPin = SerialPin.C17

    let letztePosition = ""

    let nmea: { [key: string]: string } = {
        RMC: "",
        GGA: "",
        GSA: "",
        GSV: "",
        ZDA: ""
    }

    // =========================================================
    // INITIALISIERUNG
    // =========================================================

    /**
     * Startet das Air530 GPS Modul.
     */
    //% group="Grundfunktionen"
    //% block="Initialisiere GPS-Modul RX %rx TX %tx"
    //% block.tooltip="Initialisiert das Air530 GPS Modul."
    //% rx.defl=SerialPin.C16
    //% tx.defl=SerialPin.C17
    export function starten(rx: SerialPin, tx: SerialPin): void {

        rxPin = rx
        txPin = tx

        serial.redirect(txPin, rxPin, BaudRate.BaudRate9600)

        serial.setRxBufferSize(256)

        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {

            let zeile = serial.readLine()

            if (pruefePruefsumme(zeile)) {
                verarbeiteNMEA(zeile)
            }
        })
    }

    // =========================================================
    // GRUNDFUNKTIONEN
    // =========================================================

    /**
     * Gibt Datum und/oder Uhrzeit zurück.
     */
    //% group="Grundfunktionen"
    //% block="GPS %typ"
    //% block.tooltip="Liest Datum und Uhrzeit vom GPS."
    export function datumZeit(typ: DatumZeitTyp): string {

        let satz = nmea.RMC || nmea.ZDA

        if (!satz) {
            return "Keine Daten"
        }

        let teile = satz.split(",")

        let zeit = formatiereZeit(teile[1])

        let datum = ""

        if (satz == nmea.RMC) {
            datum = formatiereDatum(teile[9])
        } else {
            datum = `${teile[4]}-${teile[3]}-${teile[2]}`
        }

        switch (typ) {

            case DatumZeitTyp.Datum:
                return datum

            case DatumZeitTyp.Uhrzeit:
                return zeit

            case DatumZeitTyp.DatumUndZeit:
                return `${datum} ${zeit}`
        }

        return ""
    }

    /**
     * Gibt Positionsdaten zurück.
     */
    //% group="Grundfunktionen"
    //% block="Position %typ Format %format"
    //% block.tooltip="Liest GPS Positionsdaten."
    export function position(
        typ: PositionsTyp,
        format: KoordinatenFormat
    ): string {

        if (!nmea.GGA) {
            return "Keine Daten"
        }

        let t = nmea.GGA.split(",")

        let breitengrad = formatiereKoordinate(
            t[2],
            t[3],
            false,
            format
        )

        let laengengrad = formatiereKoordinate(
            t[4],
            t[5],
            true,
            format
        )

        let hoehe = `${t[9]} ${t[10]}`

        letztePosition = `${breitengrad}, ${laengengrad}`

        switch (typ) {

            case PositionsTyp.Breitengrad:
                return breitengrad

            case PositionsTyp.Laengengrad:
                return laengengrad

            case PositionsTyp.Koordinaten:
                return `${breitengrad}, ${laengengrad}`

            case PositionsTyp.Hoehe:
                return hoehe

            case PositionsTyp.Alle:
                return `${breitengrad}, ${laengengrad}, Höhe: ${hoehe}`
        }

        return ""
    }

    /**
     * Gibt Bewegungsdaten zurück.
     */
    //% group="Grundfunktionen"
    //% block="Bewegung %typ"
    //% block.tooltip="Liest Geschwindigkeit und Kurs."
    export function bewegung(typ: BewegungsTyp): string {

        if (!nmea.RMC) {
            return "Keine Daten"
        }

        let t = nmea.RMC.split(",")

        let knoten = parseFloat(t[7])

        let kmh = Math.round(knoten * 1.852 * 100) / 100

        let ms = Math.round(knoten * 0.514444 * 100) / 100

        let kurs = t[8]

        switch (typ) {

            case BewegungsTyp.GeschwindigkeitKMH:
                return `${kmh}`

            case BewegungsTyp.GeschwindigkeitMS:
                return `${ms}`

            case BewegungsTyp.Kurs:
                return `${kurs}°`

            case BewegungsTyp.Alle:
                return `Geschwindigkeit: ${kmh} km/h, Kurs: ${kurs}°`
        }

        return ""
    }

    /**
     * Gibt GPS Informationen zurück.
     */
    //% group="Grundfunktionen"
    //% block="GPS Information %typ"
    //% block.tooltip="Liest zusätzliche GPS Informationen."
    export function information(typ: InfoTyp): string {

        if (!nmea.GGA && typ != InfoTyp.Status) {
            return "Keine Daten"
        }

        switch (typ) {

            case InfoTyp.Satelliten:

                return nmea.GGA.split(",")[7] || "0"

            case InfoTyp.Qualitaet:

                let q = parseInt(nmea.GGA.split(",")[6])

                switch (q) {

                    case 0: return "Kein Fix"
                    case 1: return "GPS Fix"
                    case 2: return "DGPS Fix"
                    case 4: return "RTK Fix"
                    case 5: return "Float RTK"

                    default:
                        return "Unbekannt"
                }

            case InfoTyp.HDOP:

                return nmea.GGA.split(",")[8]

            case InfoTyp.Status:

                if (!nmea.RMC) {
                    return "Keine Daten"
                }

                return nmea.RMC.split(",")[2] == "A"
                    ? "Aktiv"
                    : "Ungültig"
        }

        return ""
    }

    // =========================================================
    // ERWEITERUNGEN
    // =========================================================

    /**
     * Gibt true zurück, wenn ein GPS Fix vorhanden ist.
     */
    //% group="Erweiterungen"
    //% block="GPS hat Fix"
    //% block.tooltip="Prüft ob ein gültiger GPS Fix vorhanden ist."
    export function hatFix(): boolean {

        if (!nmea.GGA) {
            return false
        }

        return nmea.GGA.split(",")[6] != "0"
    }

    /**
     * Wartet bis ein GPS Fix vorhanden ist.
     */
    //% group="Erweiterungen"
    //% block="Warte bis GPS Fix"
    //% block.tooltip="Hält das Programm an bis ein GPS Signal gefunden wurde."
    export function warteAufFix(): void {

        while (!hatFix()) {
            basic.pause(1000)
        }
    }

    /**
     * Gibt true zurück wenn genügend Satelliten vorhanden sind.
     */
    //% group="Erweiterungen"
    //% block="Mindestens %anzahl Satelliten"
    //% block.tooltip="Prüft ob genügend Satelliten empfangen werden."
    //% anzahl.defl=6
    export function hatSatelliten(anzahl: number): boolean {

        let s = parseInt(information(InfoTyp.Satelliten))

        return s >= anzahl
    }

    /**
     * Wartet bis genügend Satelliten vorhanden sind.
     */
    //% group="Erweiterungen"
    //% block="Warte bis mindestens %anzahl Satelliten"
    //% block.tooltip="Wartet bis genügend Satelliten empfangen werden."
    //% anzahl.defl=6
    export function warteAufSatelliten(anzahl: number): void {

        while (!hatSatelliten(anzahl)) {
            basic.pause(1000)
        }
    }

    /**
     * Gibt die letzte bekannte Position zurück.
     */
    //% group="Erweiterungen"
    //% block="Letzte bekannte Position"
    //% block.tooltip="Gibt die zuletzt gespeicherte GPS Position zurück."
    export function letzteBekanntePosition(): string {

        return letztePosition
    }

    /**
     * Gibt true zurück wenn sich die Position geändert hat.
     */
    //% group="Erweiterungen"
    //% block="Position geändert"
    //% block.tooltip="Prüft ob sich die GPS Position verändert hat."
    export function positionGeaendert(): boolean {

        let aktuell = position(
            PositionsTyp.Koordinaten,
            KoordinatenFormat.DG
        )

        if (aktuell != letztePosition) {

            letztePosition = aktuell
            return true
        }

        return false
    }

    // =========================================================
    // NMEA VERARBEITUNG
    // =========================================================

    function pruefePruefsumme(satz: string): boolean {

        if (satz.charAt(0) != '$') {
            return false
        }

        let stern = satz.indexOf('*')

        if (stern < 0) {
            return false
        }

        let daten = satz.substr(1, stern - 1)

        let pruefsumme = parseInt(
            satz.substr(stern + 1),
            16
        )

        let xor = 0

        for (let i = 0; i < daten.length; i++) {
            xor ^= daten.charCodeAt(i)
        }

        return xor == pruefsumme
    }

    function verarbeiteNMEA(satz: string): void {

        let typ = satz.slice(3, 6)

        switch (typ) {

            case "RMC":
            case "GGA":
            case "GSA":
            case "GSV":
            case "ZDA":

                nmea[typ] = satz
                break
        }
    }

    // =========================================================
    // FORMATIERUNG
    // =========================================================

    function formatiereZeit(z: string): string {

        if (z.length < 6) {
            return "Ungültig"
        }

        return `${z.substr(0, 2)}:${z.substr(2, 2)}:${z.substr(4, 2)}`
    }

    function formatiereDatum(d: string): string {

        if (d.length != 6) {
            return "Ungültig"
        }

        return `20${d.substr(4, 2)}-${d.substr(2, 2)}-${d.substr(0, 2)}`
    }

    function formatiereKoordinate(
        wert: string,
        richtung: string,
        istLaengengrad: boolean,
        format: KoordinatenFormat
    ): string {

        if (!wert || !richtung) {
            return "Ungültig"
        }

        let gradTeil = istLaengengrad
            ? wert.slice(0, 3)
            : wert.slice(0, 2)

        let minutenTeil = istLaengengrad
            ? wert.slice(3)
            : wert.slice(2)

        let grad = parseFloat(gradTeil)

        let minuten = parseFloat(minutenTeil)

        switch (format) {

            case KoordinatenFormat.GMS:

                let ganzeMinuten = Math.floor(minuten)

                let sekunden = (minuten - ganzeMinuten) * 60

                return `${richtung}${grad}° ${ganzeMinuten}' ${Math.round(sekunden * 100) / 100}"`

            case KoordinatenFormat.GDM:

                return `${richtung}${grad}° ${Math.round(minuten * 10000) / 10000}'`

            case KoordinatenFormat.DG:

                let dezimalgrad = grad + (minuten / 60)

                return `${richtung}${Math.round(dezimalgrad * 1000000) / 1000000}°`
        }

        return ""
    }
}
