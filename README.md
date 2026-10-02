# Cassiopeia Website

Moderne website voor damesdispuut Cassiopeia met een besloten ledenomgeving.

## Functionaliteiten

* Besloten ledenportaal
* Inloggen met beveiligde sessies
* Eenmalige uitnodigings- en wachtwoordherstellinks
* Leden kiezen zelf hun wachtwoord; admins zien of delen nooit wachtwoorden
* Accountstatussen voor openstaande uitnodigingen, actieve en uitgeschakelde accounts
* Ledenbestand met zoekfunctie
* Persoonlijke ledenprofielen
* Activiteitenoverzicht
* Inschrijven en uitschrijven voor activiteiten
* Aparte adminomgeving voor accounts en uitnodigingen
* Veilige ledenimport via CSV of tekst-PDF, met controlevoorbeeld en dubbele-detectie
* Beheeromgeving voor activiteiten
* Overzicht van inschrijvingen per activiteit
* Brute-forcebeperking, beveiligingsheaders en sessie-intrekking

## Techniek

* Node.js
* Express.js
* SQLite
* HTML, CSS en browser-JavaScript
* Bcrypt-authenticatie

## Accounts en uitnodigingen

1. Een admin kiest **Beheer** en maakt een lid aan.
2. De app maakt een persoonlijke link die 48 uur geldig is en eenmaal werkt.
3. De admin deelt deze link privé met het betreffende lid.
4. Het lid kiest zelf een wachtwoord van minimaal 12 tekens en wordt direct ingelogd.

Voor een bestaand account kan een admin op dezelfde plek een nieuwe wachtwoordlink maken. Hiermee wordt het oude wachtwoord vervangen en worden oudere sessies ingetrokken. Zonder maildienst deel je links handmatig via een privékanaal.

## Onboardingmail

Als er een maildienst is ingesteld, krijgt elk nieuw lid (los aangemaakt of via de import) precies één welkomstmail met de persoonlijke uitnodigingslink. In de mail staat dat het lid via de link een eigen wachtwoord kiest en daarna onder **Profiel** haar gegevens invult. Een nieuwe wachtwoordlink die een admin later maakt, wordt niet automatisch gemaild.

```bash
APP_BASE_URL="https://jouw-portaal.nl" \
MAIL_FROM="Cassiopeia <bestuur@jouw-domein.nl>" \
SMTP_HOST="smtp.jouw-provider.nl" \
SMTP_PORT="587" \
SMTP_USER="gebruikersnaam" \
SMTP_PASSWORD="smtp-wachtwoord" \
npm start
```

Zonder `APP_BASE_URL`, `MAIL_FROM` en `SMTP_HOST` wordt er niets gemaild en werkt alles zoals voorheen.

## Leden importeren

Een admin kan onder **Beheer** een CSV of tekst-PDF uploaden. Naam, e-mail en lichting zijn verplicht; functie, status, commissie, telefoon, adres en bio zijn optioneel. De app toont eerst een controlevoorbeeld, slaat bestaande e-mailadressen en ongeldige rijen over en maakt pas na bevestiging accounts met een persoonlijke uitnodigingslink aan.

De import accepteert maximaal 250 leden en een bestand van maximaal 5 MB. Gescande PDF's zonder selecteerbare tekst worden niet verwerkt. In het importvenster staat een CSV-sjabloon klaar om te downloaden.

## Beheerder eenmalig instellen of herstellen

Er worden bewust geen standaard- of demoaccounts aangemaakt. Stel een eerste beheerder in via omgevingsvariabelen. Dezelfde methode kan een bestaand account eenmalig een nieuw veilig wachtwoord en adminrechten geven:

```bash
BOOTSTRAP_ADMIN_NAME="Cassiopeia beheerder" \
BOOTSTRAP_ADMIN_EMAIL="beheerder@example.nl" \
BOOTSTRAP_ADMIN_PASSWORD="kies-hier-een-uniek-lang-wachtwoord" \
npm start
```

Het wachtwoord moet uniek zijn en minimaal 12 tekens bevatten. De bootstrap wordt per e-mailadres slechts eenmaal uitgevoerd; verwijder de variabelen na de eerste succesvolle start.

In productie zijn daarnaast `NODE_ENV=production` en een sterke, willekeurige `SESSION_SECRET` verplicht.

## Beveiligingsmigratie

Bij de eerste start van deze versie worden de eerder gepubliceerde standaardaccounts automatisch geblokkeerd, adminrechten van die accounts ingetrokken en bestaande sessies eenmalig verwijderd. Een beheerder moet voor getroffen echte leden daarna een nieuw wachtwoord instellen.

De productie-update van 29 augustus 2026 verwijdert daarnaast eenmalig alle bestaande niet-adminleden en hun sessies. Adminaccounts blijven behouden, zodat het ledenbestand daarna schoon via de PDF/CSV-import kan worden opgebouwd.
