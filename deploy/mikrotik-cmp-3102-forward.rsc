# MikroTik — forward WAN TCP 3102 -> 192.168.10.148:3102 (central CMP)
# WAN interface on your router: ether1
# Paste entire block in Terminal, or: /import file-name=mikrotik-cmp-3102-forward.rsc

/ip firewall nat remove [find comment="AVision Central CMP 3102"]
/ip firewall filter remove [find comment="AVision Central CMP 3102"]

/ip firewall nat add chain=dstnat in-interface=ether1 protocol=tcp dst-port=3102 action=dst-nat to-addresses=192.168.10.148 to-ports=3102 comment="AVision Central CMP 3102"

/ip firewall filter add chain=forward action=accept connection-state=new protocol=tcp dst-address=192.168.10.148 dst-port=3102 comment="AVision Central CMP 3102" place-before=0
