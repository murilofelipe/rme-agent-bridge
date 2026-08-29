#include "api_server.hpp"

#include <httplib.h>

#include <utility>

namespace rme_agent {

ApiServer::ApiServer(std::string host, std::uint16_t port)
    : host_(std::move(host)), port_(port) {}

ApiServer::~ApiServer() {
    stop();
}

void ApiServer::start() {
    // TODO(fase-1): instanciar httplib::Server, registrar os endpoints
    // /api/v1/{tile,brush,autoborder} e servir em host_:port_ numa thread
    // dedicada, com mutex no canvas do RME.
    (void)host_;
    (void)port_;
    running_ = true;
}

void ApiServer::stop() {
    running_ = false;
}

} // namespace rme_agent
