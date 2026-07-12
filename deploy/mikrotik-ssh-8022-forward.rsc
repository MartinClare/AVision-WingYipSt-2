# MikroTik — forward WAN TCP 8022 -> 192.168.10.148:8022 (SSH to axon CMP server)
# WAN interface: ether1 (adjust if different)
# Paste in MikroTik Terminal, or: /import file-name=mikrotik-ssh-8022-forward.rsc
#
# Mac connect after rule is applied:
#   ssh -p 8022 axon@YOUR_PUBLIC_IP

/ip firewall nat remove [find comment="AVision SSH 8022"]
/ip firewall filter remove [find comment="AVision SSH 8022"]

/ip firewall nat add chain=dstnat in-interface=ether1 protocol=tcp dst-port=8022 action=dst-nat to-addresses=192.168.10.148 to-ports=8022 comment="AVision SSH 8022"

/ip firewall filter add chain=forward action=accept connection-state=new protocol=tcp dst-address=192.168.10.148 dst-port=8022 comment="AVision SSH 8022" place-before=0
