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

Voor een bestaand account kan een admin op dezelfde plek een nieuwe wachtwoordlink maken. Hiermee wordt het oude wachtwoord vervangen en worden oudere sessies ingetrokken. Er is nog geen maildienst gekoppeld; links worden daarom handmatig via een privékanaal gedeeld.

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
