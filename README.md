# Cassiopeia Website

Een moderne website voor damesdispuut Cassiopeia met een besloten, LMS-achtig ledenportaal.

## Starten

### In VS Code

Gebruik deze manier. Dan draait alles via Visual Studio Code.

1. Open de map `cassio` of `Cassio website` in VS Code.
2. Klik links op `Run and Debug`.
3. Kies bovenaan `Run Cassiopeia website`.
4. Klik op de groene play-knop.
5. De browser opent automatisch op `http://127.0.0.1:3000`.

Dit is beter dan `Go Live`, omdat login, sessies en SQLite een Node-server nodig hebben.

### Makkelijkste manier

```bash
npm install
npm start
```

Open daarna `http://localhost:3000` of `http://127.0.0.1:3000`.

### Met VS Code Go Live

Go Live kan alleen de voorkant openen. Voor login, leden en activiteiten moet de backend ook draaien.

1. Open deze map in VS Code: `Cassio website`
2. Open `Terminal` -> `Run Task...`
3. Kies `Start Cassiopeia backend`
4. Klik daarna rechtsonder op `Go Live`
5. VS Code opent de website op `http://127.0.0.1:5500`

Als je alleen op Go Live klikt zonder backend, zie je de website wel, maar login en databasefuncties werken dan niet.

## Eerste login

- E-mail: `admin@cassiopeia.local`
- Wachtwoord: `Cassio2026!`

Verander dit wachtwoord lokaal via de adminfunctie zodra je de app gebruikt.

## Functionaliteiten

- Publieke website met homepage, over-ons sectie, activiteitenblok en ledenlogin
- Besloten ledenomgeving met module-achtige indeling
- Login met sessies
- Wachtwoorden met bcrypt
- Ledenbestand met zoekfunctie
- Detailpagina per lid
- Adminbeheer voor leden
- Activiteitenoverzicht
- Inschrijven en uitschrijven voor activiteiten
- Adminbeheer voor activiteiten
- Inschrijvingen per activiteit bekijken
