# Cassiopeia Website

Moderne website voor damesdispuut Cassiopeia met een besloten ledenomgeving.

## Functionaliteiten

* Publieke website met homepage, over ons-pagina en activiteitenoverzicht
* Besloten ledenportaal
* Inloggen met beveiligde sessies
* Wachtwoordbeveiliging met bcrypt
* Ledenbestand met zoekfunctie
* Persoonlijke ledenprofielen
* Activiteitenoverzicht
* Inschrijven en uitschrijven voor activiteiten
* Beheeromgeving voor leden
* Beheeromgeving voor activiteiten
* Overzicht van inschrijvingen per activiteit

## Techniek

* Node.js
* Express.js
* SQLite
* EJS Templates
* Bcrypt authenticatie
* Server-side rendering

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
