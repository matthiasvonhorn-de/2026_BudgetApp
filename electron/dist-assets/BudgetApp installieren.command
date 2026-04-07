#!/bin/bash
#
# BudgetApp — Installationsskript
#
# Dieses Skript macht die App startbar, indem es die macOS-Quarantäne
# entfernt, und öffnet die App anschließend.
#
# Einfach doppelklicken!
#

DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/BudgetApp.app"

echo ""
echo "==================================="
echo "  BudgetApp — Installation"
echo "==================================="
echo ""

if [ ! -d "$APP" ]; then
    echo "Fehler: BudgetApp.app nicht gefunden."
    echo "Die App muss im selben Ordner wie dieses Skript liegen."
    echo ""
    read -n 1 -s -r -p "Drücke eine Taste zum Schließen..."
    exit 1
fi

echo "Entferne macOS-Quarantäne..."
xattr -cr "$APP"
echo "Fertig!"
echo ""
echo "Starte BudgetApp..."
open "$APP"
echo ""
echo "Die App wurde gestartet. Du kannst dieses Fenster jetzt schließen."
echo ""
read -n 1 -s -r -p "Drücke eine Taste zum Schließen..."
