"use strict";

// Logica pura per il single-instance lock: decide se l'istanza corrente deve
// "cedere il posto" a una seconda istanza appena avviata.
//
// Regola: handoff solo quando la seconda istanza dichiara una versione DIVERSA
// (app aggiornata o reinstallata). In quel caso la vecchia si riavvia dal
// binario attualmente installato, cosi' le novita' vengono davvero caricate.
// Istanze legacy che non inviano additionalData mantengono il comportamento
// precedente (solo focus della finestra).

function shouldHandoverToSecondInstance(currentVersion, additionalData) {
  if (!additionalData || typeof additionalData !== "object") return false;
  const incoming = additionalData.version;
  return typeof incoming === "string" && incoming.length > 0 && incoming !== currentVersion;
}

module.exports = { shouldHandoverToSecondInstance };
