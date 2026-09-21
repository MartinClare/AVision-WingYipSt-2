# MikroTik — forward WAN TCP 3100 -> 192.168.10.148:3100 (PPE-UI)
# Paste in Terminal, or: /import file-name=mikrotik-ppe-ui-3100-forward.rsc

:local publicPort 3100
:local edgeIp "192.168.10.148"
:local edgePort 3100
:local ruleComment "AVision PPE-UI 3100"

/ip firewall nat remove [find comment=$ruleComment]
/ip firewall filter remove [find comment=$ruleComment]

/ip firewall nat add \
    chain=dstnat \
    in-interface-list=WAN \
    protocol=tcp \
    dst-port=$publicPort \
    action=dst-nat \
    to-addresses=$edgeIp \
    to-ports=$edgePort \
    comment=$ruleComment

/ip firewall filter add \
    chain=forward \
    action=accept \
    connection-state=new \
    protocol=tcp \
    dst-address=$edgeIp \
    dst-port=$edgePort \
    comment=$ruleComment \
    place-before=0

:put "Done. Test: http://YOUR_PUBLIC_IP:3100/  login admin / 852852"
