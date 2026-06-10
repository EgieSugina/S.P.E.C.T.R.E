package trace

import (
	"testing"
)

func TestParseTraceroute(t *testing.T) {
	output := `traceroute to example.com (93.184.216.34), 30 hops max, 60 byte packets
 1  192.168.1.1  0.456 ms
 2  10.0.0.1 (10.0.0.1)  5.123 ms
 3  * * *
 4  93.184.216.34  12.345 ms`

	hops := parseTraceroute(output)
	if len(hops) != 4 {
		t.Fatalf("expected 4 hops, got %d", len(hops))
	}
	if hops[0].Host != "192.168.1.1" || hops[0].RTTMs != 0.456 {
		t.Errorf("hop 1: %+v", hops[0])
	}
	if hops[2].Status != HopTimeout {
		t.Errorf("hop 3 should be timeout, got %s", hops[2].Status)
	}
}

func TestParseTracepath(t *testing.T) {
	output := ` 1?: [LOCALHOST]                      pmtu 1500
 1:  192.168.1.1                      0.456ms 
 2:  10.0.0.1                         5.123ms reached`

	hops := parseTracepath(output)
	if len(hops) != 2 {
		t.Fatalf("expected 2 hops, got %d", len(hops))
	}
	if hops[1].Status != HopTarget {
		t.Errorf("last hop should be target, got %s", hops[1].Status)
	}
}

func TestPrependLocal(t *testing.T) {
	hops := prependLocal([]Hop{{Hop: 1, Host: "1.2.3.4", Status: HopAlive}})
	if len(hops) != 2 || hops[0].Status != HopLocal || hops[1].Hop != 2 {
		t.Fatalf("unexpected: %+v", hops)
	}
}
