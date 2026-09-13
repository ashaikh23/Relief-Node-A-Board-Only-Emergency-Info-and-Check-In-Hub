# Third-party notices

Relief Node is an original project integration built on open-source software, an open language model, and public data services.

This file records the major third-party components used by the project so their licenses and attribution are clear.

## Arduino App Lab, Bricks, Bridge, and libraries

Relief Node is built for the Arduino UNO Q using Arduino App Lab and Arduino libraries.

The project uses documented Arduino App Lab, WebUI, LLM Brick, RouterBridge, and LED Matrix workflows.

Official Arduino App Lab example and Brick repositories publish their applicable open-source licensing information, including MPL-2.0 components.

References:

- https://github.com/arduino/app-bricks-examples
- https://github.com/arduino/app-bricks-py
- https://docs.arduino.cc/software/app-lab/

## Qwen 3.5 0.8B

Relief Node uses `Qwen3.5-0.8B-Q4_0` through the Arduino local LLM Brick.

The model itself is not stored in this Git repository; Arduino App Lab provisions it separately on the UNO Q.

Model page:

- https://huggingface.co/Qwen/Qwen3.5-0.8B

License:

- Apache License 2.0

## Pico CSS

The Relief Node browser interface may load Pico CSS v2 as an optional progressive visual enhancement.

The project also contains its own local stylesheet so the emergency interface remains styled when internet access is unavailable.

Project:

- https://github.com/picocss/pico

License:

- MIT

## Open-Meteo

Relief Node uses Open-Meteo for public weather information when internet access is available.

Service:

- https://open-meteo.com/

Terms:

- https://open-meteo.com/en/terms

Attribution used by the project:

> Weather data by Open-Meteo.

## U.S. National Weather Service

Relief Node can retrieve active U.S. public alert information from the National Weather Service.

Service:

- https://www.weather.gov/

Disclaimer:

- https://www.weather.gov/disclaimer

Relief Node does not claim NWS information as its own and does not imply NOAA or National Weather Service endorsement.

## Project artwork

The Relief Node logo and project-specific artwork included in this repository were supplied for this project by the project author.

## Relief Node code and integration

The Relief Node project concept, application integration, interface implementation, emergency workflow, check-in system, climate logger, physical status behavior, project documentation, and project-specific source code in this repository were assembled for this project.

No separate open-source license is granted for the project author's original Relief Node material unless a future repository version explicitly adds one.
