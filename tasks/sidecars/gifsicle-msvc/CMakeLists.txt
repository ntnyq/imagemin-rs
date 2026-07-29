cmake_minimum_required(VERSION 3.25)
project(imagemin_rs_gifsicle C)

if(NOT DEFINED GIFSICLE_SOURCE_ROOT)
  message(FATAL_ERROR "GIFSICLE_SOURCE_ROOT is required")
endif()

configure_file(
  "${GIFSICLE_SOURCE_ROOT}/src/win32cfg.h"
  "${CMAKE_CURRENT_BINARY_DIR}/config.h"
  COPYONLY
)

add_executable(
  gifsicle
  "${GIFSICLE_SOURCE_ROOT}/src/clp.c"
  "${GIFSICLE_SOURCE_ROOT}/src/fmalloc.c"
  "${GIFSICLE_SOURCE_ROOT}/src/giffunc.c"
  "${GIFSICLE_SOURCE_ROOT}/src/gifread.c"
  "${GIFSICLE_SOURCE_ROOT}/src/gifunopt.c"
  "${GIFSICLE_SOURCE_ROOT}/src/gifwrite.c"
  "${GIFSICLE_SOURCE_ROOT}/src/gifsicle.c"
  "${GIFSICLE_SOURCE_ROOT}/src/kcolor.c"
  "${GIFSICLE_SOURCE_ROOT}/src/merge.c"
  "${GIFSICLE_SOURCE_ROOT}/src/optimize.c"
  "${GIFSICLE_SOURCE_ROOT}/src/quantize.c"
  "${GIFSICLE_SOURCE_ROOT}/src/support.c"
  "${GIFSICLE_SOURCE_ROOT}/src/xform.c"
)
target_compile_definitions(gifsicle PRIVATE HAVE_CONFIG_H=1 _CONSOLE)
target_include_directories(
  gifsicle
  PRIVATE
    "${CMAKE_CURRENT_BINARY_DIR}"
    "${GIFSICLE_SOURCE_ROOT}/include"
)
set_property(TARGET gifsicle PROPERTY MSVC_RUNTIME_LIBRARY MultiThreaded)
