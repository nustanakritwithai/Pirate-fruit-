# Pirate Fruit Server — S1 skeleton

This package is the buildable boundary for the future Render Web Service.

S1 intentionally contains no HTTP listener, database connection, session handling,
or gameplay authority. Those belong to S2 onward. It imports only browser-free
contracts from `@pirate-fruit/shared` so the client can remain a working Render
Static Site while the server boundary is introduced.
