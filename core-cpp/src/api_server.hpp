#pragma once

#include <cstdint>
#include <string>

namespace rme_agent {

// Andaime do servidor da API injetada no RME (Fase 1 de
// docs/planejamento/arquitetura.md). Implementação real dos endpoints e a
// sincronização com o loop de renderização OpenGL entram em fases futuras.
class ApiServer {
public:
    explicit ApiServer(std::string host = "127.0.0.1", std::uint16_t port = 8080);
    ~ApiServer();

    // Sobe o servidor numa thread própria. TODO: registrar rotas
    //   POST /api/v1/tile
    //   POST /api/v1/brush
    //   POST /api/v1/autoborder
    void start();

    // Encerra o servidor e junta a thread.
    void stop();

    bool running() const { return running_; }

private:
    std::string host_;
    std::uint16_t port_;
    bool running_ = false;
};

} // namespace rme_agent
