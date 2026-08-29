"""Ponto de entrada do agente (Fase 3 de docs/planejamento/arquitetura.md).

Andaime: a orquestração real (lê a especificação, gera a lógica espacial,
consome a SDK em Node) entra em fases futuras.
"""

from __future__ import annotations


def run(spec: str) -> None:
    """Processa uma especificação de mapa em linguagem natural."""
    raise NotImplementedError(
        "andaime do agente, ver docs/planejamento/arquitetura.md"
    )


if __name__ == "__main__":
    import sys

    run(" ".join(sys.argv[1:]))
