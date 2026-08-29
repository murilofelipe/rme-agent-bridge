cmake_minimum_required(VERSION 3.16)
project(rme_agent_api LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# Servidor HTTP header-only (Fase 1 de docs/planejamento/arquitetura.md).
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.15.3
)
FetchContent_MakeAvailable(httplib)

# Lib da API isolada. O link dentro do build completo do RME (core-cpp/rme)
# vem numa fase futura; aqui ela compila sozinha.
add_library(rme_agent_api STATIC
    src/api_server.cpp
)
target_include_directories(rme_agent_api PUBLIC src)
target_link_libraries(rme_agent_api PUBLIC httplib::httplib)
