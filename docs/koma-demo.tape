Output koma-demo.gif
Set Shell "bash"

Set Theme "Chalk"
Set FontFamily "JetBrains Mono"
Set FontSize 16
Set Width 1200
Set Height 720
Set Padding 40

Type "curl -s -X POST http://localhost:8080/guard -H 'Content-Type: application/json' --data-binary @docs/guard-request.json"
Enter
Sleep 1s

Type "curl -s -X POST http://localhost:8080/scout -H 'Content-Type: application/json' --data-binary @docs/scout-small-request.json"
Enter
Sleep 1s

Type "curl -s -X POST http://localhost:8080/scout -H 'Content-Type: application/json' --data-binary @docs/scout-large-request.json"
Enter
Sleep 1s

Type "curl -s -X POST http://localhost:8080/ingest -H 'Content-Type: application/json' --data-binary @docs/ingest-request.json"
Enter
Sleep 1s

Type "curl -s http://localhost:8080/search?q=Demo"
Enter
Sleep 1s

Type "curl -s http://localhost:8080/content?token=af42adfe399cfe7fc606568ef6d20adf"
Enter
Sleep 1s